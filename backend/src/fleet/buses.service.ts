import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toDate, today } from '../common/dates.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  BusStatus,
  OdometerSource,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { documentState } from '../staff/documents/document-status.js';
import {
  busFitness,
  documentsSummary,
  odometerError,
  seatsFromLayout,
} from './bus-rules.js';
import { CatalogsService } from './catalogs.service.js';
import {
  BlockSeatDto,
  ChangeBusStatusDto,
  CreateBusDocumentDto,
  CreateBusDto,
  QueryBusesDto,
  UpdateBusDocumentDto,
  UpdateBusDto,
} from './dto/bus.dto.js';
import type { BusLayout } from './layout-rules.js';

const TABLE = 'buses';

const listInclude = {
  busModel: {
    select: {
      id: true,
      brand: true,
      model: true,
      busType: true,
      seatCount: true,
    },
  },
  terminal: {
    select: {
      id: true,
      code: true,
      name: true,
      latitude: true,
      longitude: true,
    },
  },
  documents: { select: { type: true, issueDate: true, expiryDate: true } },
  _count: { select: { seats: { where: { isBlocked: true } } } },
} satisfies Prisma.BusInclude;

type ListRow = Prisma.BusGetPayload<{ include: typeof listInclude }>;

const located = (t: { latitude: unknown; longitude: unknown }) =>
  t.latitude !== null && t.longitude !== null;

/** Estados que exigen explicar el motivo. */
const NEEDS_REASON: BusStatus[] = [
  BusStatus.maintenance,
  BusStatus.out_of_service,
];

@Injectable()
export class BusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly catalogs: CatalogsService,
  ) {}

  private alertDays() {
    return this.settings.get('fleet.document_alert_days');
  }

  /** Agrega a cada unidad si es apta, sus motivos, asientos bloqueados y la situación de sus documentos. */
  private decorate(rows: ListRow[], alertDays: number) {
    const now = today();
    return rows.map(({ documents, _count, ...bus }) => ({
      ...bus,
      blockedSeats: _count.seats,
      ...busFitness(
        {
          status: bus.status,
          terminalLocated: located(bus.terminal),
          documents,
        },
        now,
      ),
      documents: documentsSummary(documents, now, alertDays),
    }));
  }

  async findAll(q: QueryBusesDto) {
    const terms = q.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.BusWhereInput = {
      status: q.status,
      terminalId: q.terminalId,
      busModelId: q.busModelId,
      AND: terms.map((t) => ({
        OR: [
          { economicNumber: { contains: t, mode: 'insensitive' } },
          { plates: { contains: t, mode: 'insensitive' } },
          { vin: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    const [rows, total, alertDays] = await Promise.all([
      this.prisma.bus.findMany({
        where,
        include: listInclude,
        orderBy: { economicNumber: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.bus.count({ where }),
      this.alertDays(),
    ]);
    return paginate(this.decorate(rows, alertDays), total, q);
  }

  /** Cifras de la flota completa para la banda. */
  async summary() {
    const [rows, alertDays] = await Promise.all([
      this.prisma.bus.findMany({ include: listInclude }),
      this.alertDays(),
    ]);
    const buses = this.decorate(rows, alertDays);
    const byStatus = (s: BusStatus) =>
      buses.filter((b) => b.status === s).length;
    return {
      total: buses.length,
      available: byStatus(BusStatus.available),
      inService: byStatus(BusStatus.in_service),
      maintenance: byStatus(BusStatus.maintenance),
      outOfService: byStatus(BusStatus.out_of_service),
      unfit: buses.filter(
        (b) => !b.fit && b.status !== BusStatus.out_of_service,
      ).length,
      documentsExpiring: buses.reduce((n, b) => n + b.documents.expiring, 0),
      documentsExpired: buses.reduce((n, b) => n + b.documents.expired, 0),
      alertDays,
    };
  }

  /** Documentos de unidades por vencer o vencidos (el más reciente de cada tipo), para el tablero. */
  async expiringDocuments() {
    const alertDays = await this.alertDays();
    const now = today();
    const docs = await this.prisma.busDocument.findMany({
      where: {
        expiryDate: { not: null },
        bus: { status: { not: BusStatus.out_of_service } },
      },
      include: { bus: { select: { id: true, economicNumber: true } } },
      orderBy: [{ busId: 'asc' }, { type: 'asc' }, { issueDate: 'desc' }],
    });
    const seen = new Set<string>();
    const result = [];
    for (const d of docs) {
      const key = `${d.busId}:${d.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const state = documentState(d.expiryDate, now, alertDays);
      if (state.status !== 'valid') result.push({ ...d, ...state });
    }
    return result.sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
  }

  async findOne(id: string) {
    const [bus, alertDays] = await Promise.all([
      this.prisma.bus.findUniqueOrThrow({
        where: { id },
        include: {
          busModel: {
            include: {
              fuelType: { select: { id: true, name: true, unit: true } },
            },
          },
          terminal: {
            include: { city: { select: { name: true, state: true } } },
          },
          seats: {
            orderBy: [{ floor: 'asc' }, { row: 'asc' }, { col: 'asc' }],
          },
          documents: { orderBy: [{ type: 'asc' }, { issueDate: 'desc' }] },
        },
      }),
      this.alertDays(),
    ]);
    const now = today();
    return {
      ...bus,
      ...busFitness(
        {
          status: bus.status,
          terminalLocated: located(bus.terminal),
          documents: bus.documents,
        },
        now,
      ),
      documents: bus.documents.map((d) => ({
        ...d,
        ...documentState(d.expiryDate, now, alertDays),
      })),
      preventive: {
        km: bus.preventiveKm ?? bus.busModel.preventiveKm,
        days: bus.preventiveDays ?? bus.busModel.preventiveDays,
        fromModel: bus.preventiveKm === null && bus.preventiveDays === null,
      },
      canChangeModel: bus.firstServiceAt === null,
    };
  }

  /** Lecturas del odómetro y cambios de estado registrados en la bitácora. */
  async history(id: string) {
    await this.prisma.bus.findUniqueOrThrow({ where: { id } });
    const [readings, changes] = await Promise.all([
      this.prisma.odometerReading.findMany({
        where: { busId: id },
        orderBy: { recordedAt: 'desc' },
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: { tableName: TABLE, recordId: id },
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: readings.map((r) => r.recordedBy).filter((x): x is string => !!x),
        },
      },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      readings: readings.map((r) => ({
        ...r,
        recordedByName: r.recordedBy
          ? (nameOf.get(r.recordedBy) ?? null)
          : null,
      })),
      changes: changes.map((c) => ({
        id: c.id,
        actionType: c.actionType,
        user: c.user?.fullName ?? null,
        oldValues: c.oldValues,
        newValues: c.newValues,
        createdAt: c.createdAt,
      })),
    };
  }

  private async activeModel(id: string) {
    const model = await this.prisma.busModel.findUnique({ where: { id } });
    if (!model || !model.isActive)
      throw new BadRequestException('El modelo no existe o está desactivado');
    return model;
  }

  async create(dto: CreateBusDto, actor: AuthUser) {
    const model = await this.activeModel(dto.busModelId);
    await this.catalogs.assertUsableTerminal(dto.terminalId);
    const odometerKm = dto.odometerKm ?? 0;

    const bus = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bus.create({
        data: {
          ...dto,
          odometerKm,
          seats: {
            create: seatsFromLayout(model.layout as unknown as BusLayout),
          },
        },
      });
      await tx.odometerReading.create({
        data: { busId: created.id, km: odometerKm, recordedBy: actor.id },
      });
      return created;
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: bus.id,
      actionType: ActionType.insert,
      newValues: bus,
    });
    return this.findOne(bus.id);
  }

  async update(id: string, dto: UpdateBusDto, actor: AuthUser) {
    const before = await this.prisma.bus.findUniqueOrThrow({ where: { id } });
    if (dto.terminalId && dto.terminalId !== before.terminalId)
      await this.catalogs.assertUsableTerminal(dto.terminalId);

    const modelChanged =
      !!dto.busModelId && dto.busModelId !== before.busModelId;
    let seats: ReturnType<typeof seatsFromLayout> | null = null;
    if (modelChanged) {
      if (before.firstServiceAt)
        throw new BadRequestException(
          'No se puede cambiar el modelo: la unidad ya salió a servicio',
        );
      const model = await this.activeModel(dto.busModelId!);
      seats = seatsFromLayout(model.layout as unknown as BusLayout);
    }

    const bus = await this.prisma.$transaction(async (tx) => {
      // Con otro modelo los asientos se vuelven a copiar (y se pierden los bloqueos)
      if (seats) {
        await tx.busSeat.deleteMany({ where: { busId: id } });
        await tx.busSeat.createMany({
          data: seats.map((s) => ({ ...s, busId: id })),
        });
      }
      return tx.bus.update({ where: { id }, data: dto });
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: bus,
    });
    return this.findOne(id);
  }

  async changeStatus(id: string, dto: ChangeBusStatusDto, actor: AuthUser) {
    const before = await this.prisma.bus.findUniqueOrThrow({ where: { id } });
    if (before.status === dto.status)
      throw new BadRequestException('La unidad ya tiene ese estado');
    if (NEEDS_REASON.includes(dto.status) && !dto.reason)
      throw new BadRequestException('Indica el motivo del cambio de estado');
    // Salir a servicio exige que la unidad sea apta
    if (dto.status === BusStatus.in_service) {
      const current = await this.findOne(id);
      const pending = current.reasons.filter(
        (r) => !r.startsWith('La unidad está'),
      );
      if (pending.length) throw new BadRequestException(pending);
    }

    const now = new Date();
    const bus = await this.prisma.bus.update({
      where: { id },
      data: {
        status: dto.status,
        statusReason: dto.reason ?? null,
        statusChangedAt: now,
        ...(dto.status === BusStatus.in_service &&
          !before.firstServiceAt && { firstServiceAt: now }),
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: { status: before.status, statusReason: before.statusReason },
      newValues: { status: bus.status, statusReason: bus.statusReason },
    });
    return this.findOne(id);
  }

  /** Registra una lectura del odómetro; nunca puede bajar. Otros módulos la usan con su propio origen. */
  async recordOdometer(
    id: string,
    km: number,
    actor: AuthUser | null,
    source: OdometerSource = OdometerSource.manual,
  ) {
    const before = await this.prisma.bus.findUniqueOrThrow({ where: { id } });
    const error = odometerError(before.odometerKm, km);
    if (error) throw new BadRequestException(error);
    if (km === before.odometerKm) return this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.bus.update({ where: { id }, data: { odometerKm: km } }),
      this.prisma.odometerReading.create({
        data: { busId: id, km, source, recordedBy: actor?.id ?? null },
      }),
    ]);
    await this.audit.log({
      userId: actor?.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: { odometerKm: before.odometerKm },
      newValues: { odometerKm: km },
    });
    return this.findOne(id);
  }

  async blockSeat(
    busId: string,
    seatId: string,
    dto: BlockSeatDto,
    actor: AuthUser,
  ) {
    const seat = await this.prisma.busSeat.findFirstOrThrow({
      where: { id: seatId, busId },
    });
    if (dto.blocked && !dto.reason)
      throw new BadRequestException('Indica por qué se bloquea el asiento');
    const updated = await this.prisma.busSeat.update({
      where: { id: seatId },
      data: dto.blocked
        ? { isBlocked: true, blockReason: dto.reason, blockedAt: new Date() }
        : { isBlocked: false, blockReason: null, blockedAt: null },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'bus_seats',
      recordId: seatId,
      actionType: ActionType.update,
      oldValues: {
        busId,
        number: seat.number,
        isBlocked: seat.isBlocked,
        blockReason: seat.blockReason,
      },
      newValues: {
        busId,
        number: seat.number,
        isBlocked: updated.isBlocked,
        blockReason: updated.blockReason,
      },
    });
    return updated;
  }

  // ---------- Documentos ----------

  private static assertDates(issueDate: Date, expiryDate: Date | null) {
    if (expiryDate && expiryDate <= issueDate)
      throw new BadRequestException(
        'La fecha de vencimiento debe ser posterior a la de expedición',
      );
  }

  async createDocument(
    busId: string,
    dto: CreateBusDocumentDto,
    actor: AuthUser,
  ) {
    await this.prisma.bus.findUniqueOrThrow({ where: { id: busId } });
    const issueDate = toDate(dto.issueDate);
    const expiryDate = dto.expiryDate ? toDate(dto.expiryDate) : null;
    BusesService.assertDates(issueDate, expiryDate);
    const doc = await this.prisma.busDocument.create({
      data: { ...dto, busId, issueDate, expiryDate },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'bus_documents',
      recordId: doc.id,
      actionType: ActionType.insert,
      newValues: doc,
    });
    return doc;
  }

  async updateDocument(
    busId: string,
    docId: string,
    dto: UpdateBusDocumentDto,
    actor: AuthUser,
  ) {
    const before = await this.prisma.busDocument.findFirstOrThrow({
      where: { id: docId, busId },
    });
    const issueDate = dto.issueDate ? toDate(dto.issueDate) : before.issueDate;
    const expiryDate =
      dto.expiryDate === undefined
        ? before.expiryDate
        : dto.expiryDate
          ? toDate(dto.expiryDate)
          : null;
    BusesService.assertDates(issueDate, expiryDate);
    const doc = await this.prisma.busDocument.update({
      where: { id: docId },
      data: { ...dto, issueDate, expiryDate },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'bus_documents',
      recordId: docId,
      actionType: ActionType.update,
      oldValues: before,
      newValues: doc,
    });
    return doc;
  }

  async deleteDocument(busId: string, docId: string, actor: AuthUser) {
    const before = await this.prisma.busDocument.findFirstOrThrow({
      where: { id: docId, busId },
    });
    await this.prisma.busDocument.delete({ where: { id: docId } });
    await this.audit.log({
      userId: actor.id,
      tableName: 'bus_documents',
      recordId: docId,
      actionType: ActionType.delete,
      oldValues: before,
    });
  }
}
