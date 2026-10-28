import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  dateKey,
  today,
  toDate,
  addDays,
  zonedDateTime,
} from '../common/dates.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  FuelLoadStatus,
  OdometerSource,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { BusesService } from './buses.service.js';
import {
  CreateFuelLoadDto,
  QueryFuelLoadDto,
  RejectFuelLoadDto,
  UpdateFuelLoadDto,
} from './dto/fuel.dto.js';
import {
  efficiencyDropPct,
  fuelLoadError,
  fuelTotal,
  isLowEfficiency,
  measureLoads,
} from './fuel-rules.js';

const TABLE = 'fuel_loads';

/** Ven todas las cargas; los demás roles solo las suyas. */
export const FUEL_READERS: UserRole[] = [
  UserRole.admin,
  UserRole.coordinator,
  UserRole.supervisor,
];
/** Registran cargas confirmadas, y confirman o rechazan las del conductor. */
export const FUEL_MANAGERS: UserRole[] = [UserRole.admin, UserRole.coordinator];

const loadInclude = {
  bus: {
    select: {
      id: true,
      economicNumber: true,
      plates: true,
      terminal: { select: { id: true, code: true } },
      busModel: { select: { expectedEfficiency: true } },
    },
  },
  fuelType: { select: { id: true, name: true, unit: true } },
  recorder: { select: { id: true, fullName: true, role: true } },
  reviewer: { select: { id: true, fullName: true } },
} satisfies Prisma.FuelLoadInclude;

const isReader = (actor: AuthUser) => FUEL_READERS.includes(actor.role);
const isManager = (actor: AuthUser) => FUEL_MANAGERS.includes(actor.role);
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** Inicio del mes en curso en la zona de la central. */
const monthStart = () =>
  zonedDateTime(`${dateKey(today()).slice(0, 7)}-01`, '00:00');

@Injectable()
export class FuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly buses: BusesService,
  ) {}

  private log(
    actor: AuthUser,
    recordId: string,
    actionType: ActionType,
    before: object | null,
    after: object | null,
  ) {
    return this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId,
      actionType,
      oldValues: before,
      newValues: after,
    });
  }

  private scope(actor: AuthUser): Prisma.FuelLoadWhereInput {
    return isReader(actor) ? {} : { recordedBy: actor.id };
  }

  private async getLoad(id: string, actor: AuthUser) {
    const load = await this.prisma.fuelLoad.findFirst({
      where: { id, ...this.scope(actor) },
      include: loadInclude,
    });
    if (!load) throw new ForbiddenException('No tienes acceso a esta carga');
    return load;
  }

  private assertLoadedAt(value: string) {
    if (new Date(value).getTime() > Date.now() + 5 * 60_000)
      throw new BadRequestException('La fecha de la carga no puede ser futura');
  }

  /** Odómetro de la última carga confirmada de la unidad (sin contar `exceptId`). */
  private async lastConfirmedKm(busId: string, exceptId?: string) {
    const last = await this.prisma.fuelLoad.findFirst({
      where: {
        busId,
        status: FuelLoadStatus.confirmed,
        ...(exceptId && { id: { not: exceptId } }),
      },
      orderBy: { odometerKm: 'desc' },
      select: { id: true, odometerKm: true },
    });
    return last;
  }

  private async validate(
    busId: string,
    data: { quantity: number; unitPrice: number; odometerKm: number },
    exceptId?: string,
  ) {
    const [bus, last] = await Promise.all([
      this.prisma.bus.findUniqueOrThrow({
        where: { id: busId },
        include: { busModel: true },
      }),
      this.lastConfirmedKm(busId, exceptId),
    ]);
    const error = fuelLoadError(
      data,
      num(bus.busModel.tankCapacity),
      last?.odometerKm ?? null,
    );
    if (error) throw new BadRequestException(error);
    return bus;
  }

  /** Recalcula el rendimiento de todas las cargas confirmadas de la unidad. */
  private async remeasure(busId: string) {
    const loads = await this.prisma.fuelLoad.findMany({
      where: { busId, status: FuelLoadStatus.confirmed },
      orderBy: [{ odometerKm: 'asc' }, { loadedAt: 'asc' }],
    });
    const measures = measureLoads(
      loads.map((l) => ({ ...l, quantity: Number(l.quantity) })),
    );
    const changed = loads.filter((l) => {
      const m = measures.get(l.id)!;
      return (
        l.tripKm !== m.tripKm ||
        num(l.tripQuantity) !== m.tripQuantity ||
        num(l.efficiency) !== m.efficiency
      );
    });
    if (changed.length)
      await this.prisma.$transaction(
        changed.map((l) =>
          this.prisma.fuelLoad.update({
            where: { id: l.id },
            data: measures.get(l.id)!,
          }),
        ),
      );
  }

  /** Al confirmarse, la carga avanza el odómetro de la unidad si es mayor. */
  private async applyOdometer(
    load: { busId: string; odometerKm: number },
    actor: AuthUser,
  ) {
    const bus = await this.prisma.bus.findUniqueOrThrow({
      where: { id: load.busId },
    });
    if (load.odometerKm > bus.odometerKm)
      await this.buses.recordOdometer(
        load.busId,
        load.odometerKm,
        actor,
        OdometerSource.fuel,
      );
  }

  /**
   * Quién puede corregir o eliminar: la pendiente, su autor o coordinación;
   * la confirmada, coordinación y solo si es la última de la unidad.
   */
  private async assertEditable(
    load: {
      id: string;
      busId: string;
      status: FuelLoadStatus;
      recordedBy: string;
    },
    actor: AuthUser,
  ) {
    if (load.status === FuelLoadStatus.rejected)
      throw new BadRequestException('La carga fue rechazada');
    if (load.status === FuelLoadStatus.pending) {
      if (!isManager(actor) && load.recordedBy !== actor.id)
        throw new ForbiddenException('Solo quien la registró puede corregirla');
      return;
    }
    if (!isManager(actor))
      throw new BadRequestException(
        'La carga ya fue confirmada; pide a coordinación que la corrija',
      );
    const last = await this.lastConfirmedKm(load.busId);
    if (last?.id !== load.id)
      throw new BadRequestException(
        'Solo se puede corregir la última carga confirmada de la unidad',
      );
  }

  // ---------- Consultas ----------

  async findAll(q: QueryFuelLoadDto, actor: AuthUser) {
    const search = q.search?.trim();
    const where: Prisma.FuelLoadWhereInput = {
      ...this.scope(actor),
      status: q.status,
      busId: q.busId,
      ...(q.terminalId && { bus: { terminalId: q.terminalId } }),
      ...((q.from || q.to) && {
        loadedAt: {
          ...(q.from && { gte: zonedDateTime(q.from, '00:00') }),
          ...(q.to && {
            lt: zonedDateTime(dateKey(addDays(toDate(q.to), 1)), '00:00'),
          }),
        },
      }),
      ...(search && {
        OR: [
          {
            bus: {
              economicNumber: { contains: search, mode: 'insensitive' },
            },
          },
          { station: { contains: search, mode: 'insensitive' } },
          { ticket: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.fuelLoad.findMany({
        where,
        include: loadInclude,
        orderBy: [{ loadedAt: 'desc' }, { odometerKm: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.fuelLoad.count({ where }),
    ]);
    // Solo la última confirmada de cada unidad se corrige o elimina
    const last = await this.prisma.fuelLoad.findMany({
      where: {
        busId: { in: [...new Set(data.map((l) => l.busId))] },
        status: FuelLoadStatus.confirmed,
      },
      distinct: ['busId'],
      orderBy: [{ busId: 'asc' }, { odometerKm: 'desc' }],
      select: { id: true },
    });
    const lastIds = new Set(last.map((l) => l.id));
    return paginate(
      data.map((l) => ({ ...l, isLastConfirmed: lastIds.has(l.id) })),
      total,
      q,
    );
  }

  findOne(id: string, actor: AuthUser) {
    return this.getLoad(id, actor);
  }

  /**
   * Unidades para el formulario (el conductor no tiene acceso a la flota):
   * combustible y tanque del modelo, odómetro, última carga confirmada
   * y el último precio usado de cada combustible.
   */
  async formOptions() {
    const [buses, lastByBus, prices] = await Promise.all([
      this.prisma.bus.findMany({
        select: {
          id: true,
          economicNumber: true,
          plates: true,
          status: true,
          odometerKm: true,
          busModel: {
            select: {
              tankCapacity: true,
              fuelType: { select: { id: true, name: true, unit: true } },
            },
          },
        },
        orderBy: { economicNumber: 'asc' },
      }),
      this.prisma.fuelLoad.groupBy({
        by: ['busId'],
        where: { status: FuelLoadStatus.confirmed },
        _max: { odometerKm: true },
      }),
      this.prisma.fuelLoad.findMany({
        where: { status: { not: FuelLoadStatus.rejected } },
        distinct: ['fuelTypeId'],
        orderBy: [{ fuelTypeId: 'asc' }, { loadedAt: 'desc' }],
        select: { fuelTypeId: true, unitPrice: true, loadedAt: true },
      }),
    ]);
    const lastKm = new Map(lastByBus.map((r) => [r.busId, r._max.odometerKm]));
    return {
      buses: buses.map((b) => ({
        ...b,
        lastLoadKm: lastKm.get(b.id) ?? null,
      })),
      lastPrices: prices,
    };
  }

  /**
   * Rendimiento por unidad: la última medición (tanque lleno a tanque lleno)
   * contra el esperado del modelo, y el promedio de los últimos 90 días.
   */
  async efficiency(busId?: string) {
    const threshold = await this.settings.get(
      'fleet.fuel_efficiency_alert_pct',
    );
    const since = addDays(new Date(), -90);
    const [buses, latest, recent] = await Promise.all([
      this.prisma.bus.findMany({
        where: { id: busId },
        select: {
          id: true,
          economicNumber: true,
          busModel: {
            select: {
              expectedEfficiency: true,
              fuelType: { select: { unit: true } },
            },
          },
        },
        orderBy: { economicNumber: 'asc' },
      }),
      this.prisma.fuelLoad.findMany({
        where: {
          busId,
          status: FuelLoadStatus.confirmed,
          efficiency: { not: null },
        },
        distinct: ['busId'],
        orderBy: [{ busId: 'asc' }, { odometerKm: 'desc' }],
        select: { id: true, busId: true, efficiency: true, loadedAt: true },
      }),
      this.prisma.fuelLoad.groupBy({
        by: ['busId'],
        where: {
          busId,
          status: FuelLoadStatus.confirmed,
          efficiency: { not: null },
          loadedAt: { gte: since },
        },
        _sum: { tripKm: true, tripQuantity: true },
      }),
    ]);
    const last = new Map(latest.map((l) => [l.busId, l]));
    const avg = new Map(
      recent.map((r) => [
        r.busId,
        r._sum.tripKm && r._sum.tripQuantity
          ? Math.round((r._sum.tripKm / Number(r._sum.tripQuantity)) * 100) /
            100
          : null,
      ]),
    );
    return buses.map((b) => {
      const expected = num(b.busModel.expectedEfficiency);
      const l = last.get(b.id);
      const actual = l ? num(l.efficiency) : null;
      return {
        bus: { id: b.id, economicNumber: b.economicNumber },
        unit: b.busModel.fuelType.unit,
        expected,
        last: actual,
        lastAt: l?.loadedAt ?? null,
        lastLoadId: l?.id ?? null,
        average90: avg.get(b.id) ?? null,
        dropPct:
          actual !== null && expected
            ? efficiencyDropPct(actual, expected)
            : null,
        low: isLowEfficiency(actual, expected, threshold),
        threshold,
      };
    });
  }

  /** Unidades con rendimiento bajo en su última medición (Pendientes de Inicio). */
  async lowEfficiency() {
    return (await this.efficiency()).filter((e) => e.low);
  }

  /** Cargas del conductor por confirmar (Pendientes de Inicio). */
  pendingLoads() {
    return this.prisma.fuelLoad.findMany({
      where: { status: FuelLoadStatus.pending },
      include: {
        bus: { select: { id: true, economicNumber: true } },
        fuelType: { select: { unit: true } },
        recorder: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async summary(actor: AuthUser) {
    const scope = this.scope(actor);
    const month = {
      ...scope,
      status: FuelLoadStatus.confirmed,
      loadedAt: { gte: monthStart() },
    };
    const [totals, measured, pending, rejected, low] = await Promise.all([
      this.prisma.fuelLoad.aggregate({
        where: month,
        _sum: { quantity: true, total: true },
        _count: true,
      }),
      this.prisma.fuelLoad.aggregate({
        where: { ...month, efficiency: { not: null } },
        _sum: { tripKm: true, tripQuantity: true },
      }),
      this.prisma.fuelLoad.count({
        where: { ...scope, status: FuelLoadStatus.pending },
      }),
      this.prisma.fuelLoad.count({
        where: {
          ...scope,
          status: FuelLoadStatus.rejected,
          reviewedAt: { gte: monthStart() },
        },
      }),
      isReader(actor) ? this.lowEfficiency() : [],
    ]);
    const km = measured._sum.tripKm;
    const qty = num(measured._sum.tripQuantity);
    return {
      loadsThisMonth: totals._count,
      quantityThisMonth: num(totals._sum.quantity) ?? 0,
      spendThisMonth: num(totals._sum.total) ?? 0,
      averageEfficiency: km && qty ? Math.round((km / qty) * 100) / 100 : null,
      pending,
      rejectedThisMonth: rejected,
      lowEfficiencyBuses: low.length,
    };
  }

  // ---------- Registro ----------

  async create(dto: CreateFuelLoadDto, actor: AuthUser) {
    this.assertLoadedAt(dto.loadedAt);
    const bus = await this.validate(dto.busId, dto);
    const confirmed = isManager(actor);
    const now = new Date();
    const load = await this.prisma.fuelLoad.create({
      data: {
        ...dto,
        isFullTank: dto.isFullTank ?? true,
        loadedAt: new Date(dto.loadedAt),
        fuelTypeId: bus.busModel.fuelTypeId,
        total: fuelTotal(dto.quantity, dto.unitPrice),
        recordedBy: actor.id,
        status: confirmed ? FuelLoadStatus.confirmed : FuelLoadStatus.pending,
        ...(confirmed && { reviewedBy: actor.id, reviewedAt: now }),
      },
    });
    await this.log(actor, load.id, ActionType.insert, null, load);
    if (confirmed) {
      await this.applyOdometer(load, actor);
      await this.remeasure(load.busId);
    }
    return this.getLoad(load.id, actor);
  }

  async update(id: string, dto: UpdateFuelLoadDto, actor: AuthUser) {
    const before = await this.getLoad(id, actor);
    await this.assertEditable(before, actor);
    if (dto.loadedAt) this.assertLoadedAt(dto.loadedAt);
    const quantity = dto.quantity ?? Number(before.quantity);
    const unitPrice = dto.unitPrice ?? Number(before.unitPrice);
    const odometerKm = dto.odometerKm ?? before.odometerKm;
    await this.validate(before.busId, { quantity, unitPrice, odometerKm }, id);
    const { loadedAt, ...data } = dto;
    const load = await this.prisma.fuelLoad.update({
      where: { id },
      data: {
        ...data,
        ...(loadedAt && { loadedAt: new Date(loadedAt) }),
        total: fuelTotal(quantity, unitPrice),
      },
    });
    await this.log(actor, id, ActionType.update, before, load);
    if (load.status === FuelLoadStatus.confirmed) {
      await this.applyOdometer(load, actor);
      await this.remeasure(load.busId);
    }
    return this.getLoad(id, actor);
  }

  async remove(id: string, actor: AuthUser) {
    const before = await this.getLoad(id, actor);
    await this.assertEditable(before, actor);
    await this.prisma.fuelLoad.delete({ where: { id } });
    await this.log(actor, id, ActionType.delete, before, null);
    if (before.status === FuelLoadStatus.confirmed)
      await this.remeasure(before.busId);
  }

  // ---------- Revisión ----------

  async confirm(id: string, actor: AuthUser) {
    const load = await this.getLoad(id, actor);
    if (load.status !== FuelLoadStatus.pending)
      throw new BadRequestException('La carga ya fue revisada');
    // Pudo entrar otra carga confirmada mientras esperaba
    await this.validate(
      load.busId,
      {
        quantity: Number(load.quantity),
        unitPrice: Number(load.unitPrice),
        odometerKm: load.odometerKm,
      },
      id,
    );
    await this.prisma.fuelLoad.update({
      where: { id },
      data: {
        status: FuelLoadStatus.confirmed,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      },
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: load.status },
      { status: FuelLoadStatus.confirmed },
    );
    await this.applyOdometer(load, actor);
    await this.remeasure(load.busId);
    return this.getLoad(id, actor);
  }

  async reject(id: string, dto: RejectFuelLoadDto, actor: AuthUser) {
    const load = await this.getLoad(id, actor);
    if (load.status !== FuelLoadStatus.pending)
      throw new BadRequestException('La carga ya fue revisada');
    await this.prisma.fuelLoad.update({
      where: { id },
      data: {
        status: FuelLoadStatus.rejected,
        rejectReason: dto.reason,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      },
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: load.status },
      { status: FuelLoadStatus.rejected, rejectReason: dto.reason },
    );
    return this.getLoad(id, actor);
  }
}
