import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { today } from '../common/dates.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  BusStatus,
  IncidentSeverity,
  IncidentStatus,
  MaintenanceStatus,
  MaintenanceType,
  TripStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { brandedEmail, MailService } from '../mail/mail.service.js';
import { TRANSITIONS } from '../trips/status-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CloseIncidentDto,
  CreateIncidentDto,
  IncidentCategoryDto,
  IncidentOrderDto,
  QueryIncidentDto,
  UpdateIncidentCategoryDto,
  UpdateIncidentDto,
} from './dto/incident.dto.js';
import {
  INCIDENT_SEVERITY_LABELS,
  incidentFolio,
  isOpenIncident,
  OPEN_INCIDENT,
  reporterCanEdit,
  SEVERITY_RANK,
  takesBusOut,
} from './incident-rules.js';
import { MaintenanceService } from './maintenance.service.js';

const TABLE = 'bus_incidents';
const OPEN_ORDER: MaintenanceStatus[] = [
  MaintenanceStatus.scheduled,
  MaintenanceStatus.in_progress,
];

/** Revisan, atienden y ven todas las incidencias; los demás roles solo las suyas. */
export const INCIDENT_REVIEWERS: UserRole[] = [
  UserRole.admin,
  UserRole.coordinator,
  UserRole.supervisor,
];

const incidentInclude = {
  bus: {
    select: {
      id: true,
      economicNumber: true,
      plates: true,
      status: true,
      odometerKm: true,
    },
  },
  category: { select: { id: true, name: true, isAccident: true } },
  reporter: { select: { id: true, fullName: true, role: true } },
  reviewer: { select: { id: true, fullName: true } },
  trip: { select: { id: true, tripNumber: true, status: true } },
  orders: {
    select: {
      id: true,
      folio: true,
      status: true,
      scheduledDate: true,
      completedAt: true,
    },
    orderBy: { folio: 'desc' },
  },
} satisfies Prisma.BusIncidentInclude;

const isReviewer = (actor: AuthUser) => INCIDENT_REVIEWERS.includes(actor.role);

const ACCIDENT_FIELDS = [
  'claimNumber',
  'insurer',
  'thirdParties',
  'injuries',
] as const;

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  private log(
    actor: AuthUser,
    recordId: string,
    actionType: ActionType,
    before: object | null,
    after: object,
    tableName = TABLE,
  ) {
    return this.audit.log({
      userId: actor.id,
      tableName,
      recordId,
      actionType,
      oldValues: before,
      newValues: after,
    });
  }

  /** Quien no revisa solo ve lo que reportó. */
  private scope(actor: AuthUser): Prisma.BusIncidentWhereInput {
    return isReviewer(actor) ? {} : { reportedBy: actor.id };
  }

  private async getIncident(id: string, actor: AuthUser) {
    const incident = await this.prisma.busIncident.findFirst({
      where: { id, ...this.scope(actor) },
      include: incidentInclude,
    });
    if (!incident)
      throw new ForbiddenException('No tienes acceso a esta incidencia');
    return incident;
  }

  private async getCategory(id: string) {
    const category = await this.prisma.incidentCategory.findUnique({
      where: { id },
    });
    if (!category || !category.isActive)
      throw new BadRequestException(
        'La categoría no existe o está desactivada',
      );
    return category;
  }

  private assertOccurredAt(value: string) {
    if (new Date(value).getTime() > Date.now() + 5 * 60_000)
      throw new BadRequestException('La fecha del suceso no puede ser futura');
  }

  /** Los datos del siniestro solo se guardan en categorías de accidente. */
  private accidentData(isAccident: boolean) {
    return isAccident
      ? {}
      : Object.fromEntries(ACCIDENT_FIELDS.map((f) => [f, null]));
  }

  private async setBusStatus(
    busId: string,
    status: BusStatus,
    statusReason: string | null,
    actor: AuthUser,
  ) {
    const bus = await this.prisma.bus.findUniqueOrThrow({
      where: { id: busId },
    });
    await this.prisma.bus.update({
      where: { id: busId },
      data: { status, statusReason, statusChangedAt: new Date() },
    });
    await this.log(
      actor,
      busId,
      ActionType.update,
      { status: bus.status, statusReason: bus.statusReason },
      { status, statusReason },
      'buses',
    );
  }

  /** Saca de servicio a la unidad por una incidencia crítica, si aplica. */
  private async applyCritical(
    incident: {
      id: string;
      folio: number;
      busId: string;
      severity: IncidentSeverity;
      description: string;
    },
    actor: AuthUser,
  ) {
    const bus = await this.prisma.bus.findUniqueOrThrow({
      where: { id: incident.busId },
    });
    if (!takesBusOut(incident.severity, bus.status)) return false;
    await this.setBusStatus(
      bus.id,
      BusStatus.out_of_service,
      `${incidentFolio(incident.folio)}: ${incident.description}`,
      actor,
    );
    await this.prisma.busIncident.update({
      where: { id: incident.id },
      data: { tookBusOut: true },
    });
    return true;
  }

  /**
   * Al cerrar (o bajar de crítica) una incidencia que sacó la unidad de servicio,
   * la regresa a disponible si no le queda otra crítica abierta.
   */
  private async releaseFromIncident(
    incident: { id: string; busId: string; tookBusOut: boolean },
    actor: AuthUser,
  ) {
    if (!incident.tookBusOut) return;
    await this.prisma.busIncident.update({
      where: { id: incident.id },
      data: { tookBusOut: false },
    });
    const [bus, other] = await Promise.all([
      this.prisma.bus.findUniqueOrThrow({ where: { id: incident.busId } }),
      this.prisma.busIncident.findFirst({
        where: {
          busId: incident.busId,
          id: { not: incident.id },
          severity: IncidentSeverity.critical,
          status: { in: OPEN_INCIDENT },
        },
        orderBy: { folio: 'asc' },
      }),
    ]);
    // En mantenimiento la libera la orden al terminar
    if (bus.status !== BusStatus.out_of_service) return;
    if (other) {
      // Otra crítica abierta mantiene la unidad fuera y ahora es la responsable
      await this.prisma.busIncident.update({
        where: { id: other.id },
        data: { tookBusOut: true },
      });
      await this.setBusStatus(
        bus.id,
        BusStatus.out_of_service,
        `${incidentFolio(other.folio)}: ${other.description}`,
        actor,
      );
      return;
    }
    await this.setBusStatus(bus.id, BusStatus.available, null, actor);
  }

  // ---------- Consultas ----------

  async findAll(q: QueryIncidentDto, actor: AuthUser) {
    const term = q.search?.trim().replace(/^INC-?/i, '');
    const folio = term && /^\d+$/.test(term) ? Number(term) : undefined;
    const where: Prisma.BusIncidentWhereInput = {
      ...this.scope(actor),
      status:
        q.status ??
        (q.state === 'open'
          ? { in: OPEN_INCIDENT }
          : q.state === 'closed'
            ? { notIn: OPEN_INCIDENT }
            : undefined),
      severity: q.severity,
      categoryId: q.categoryId,
      busId: q.busId,
      ...(q.search && {
        AND: [
          {
            OR: [
              ...(folio ? [{ folio }] : []),
              {
                bus: {
                  economicNumber: {
                    contains: q.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                description: {
                  contains: q.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.busIncident.findMany({
        where,
        include: incidentInclude,
        // Abiertas primero (reported < in_review < resolved < dismissed), luego gravedad
        orderBy: [{ status: 'asc' }, { severity: 'desc' }, { folio: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.busIncident.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  findOne(id: string, actor: AuthUser) {
    return this.getIncident(id, actor);
  }

  async summary(actor: AuthUser) {
    const monthStart = new Date(
      Date.UTC(today().getUTCFullYear(), today().getUTCMonth(), 1),
    );
    const scope = this.scope(actor);
    const [reported, inReview, critical, resolvedThisMonth] = await Promise.all(
      [
        this.prisma.busIncident.count({
          where: { ...scope, status: IncidentStatus.reported },
        }),
        this.prisma.busIncident.count({
          where: { ...scope, status: IncidentStatus.in_review },
        }),
        this.prisma.busIncident.count({
          where: {
            ...scope,
            status: { in: OPEN_INCIDENT },
            severity: IncidentSeverity.critical,
          },
        }),
        this.prisma.busIncident.count({
          where: {
            ...scope,
            status: IncidentStatus.resolved,
            closedAt: { gte: monthStart },
          },
        }),
      ],
    );
    return {
      open: reported + inReview,
      reported,
      inReview,
      critical,
      resolvedThisMonth,
    };
  }

  /** Incidencias abiertas para Pendientes de Inicio: críticas primero, luego las más antiguas. */
  async open() {
    const rows = await this.prisma.busIncident.findMany({
      where: { status: { in: OPEN_INCIDENT } },
      include: {
        bus: { select: { id: true, economicNumber: true } },
        category: { select: { name: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
  }

  // ---------- Reporte ----------

  /**
   * Incidencia de un recorrido: la unidad debe ser la asignada y el conductor o cobrador
   * solo reporta en los suyos.
   */
  private async checkTrip(dto: CreateIncidentDto, actor: AuthUser) {
    if (!dto.tripId) return null;
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: {
        driver: { select: { userId: true } },
        collector: { select: { userId: true } },
      },
    });
    if (!trip) throw new BadRequestException('Recorrido no encontrado');
    if (trip.status === TripStatus.cancelled)
      throw new BadRequestException('El recorrido está cancelado');
    if (trip.busId !== dto.busId)
      throw new BadRequestException(
        'La unidad no es la asignada a ese recorrido',
      );
    if (
      !isReviewer(actor) &&
      trip.driver?.userId !== actor.id &&
      trip.collector?.userId !== actor.id
    )
      throw new ForbiddenException(
        'Solo puedes reportar incidencias de tus recorridos',
      );
    return trip;
  }

  /** Una crítica en un recorrido que no ha terminado lo marca como retrasado. */
  private async delayTrip(
    trip: { id: string; status: TripStatus },
    reason: string,
    actor: AuthUser,
  ) {
    if (!TRANSITIONS[trip.status].includes(TripStatus.delayed)) return;
    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: TripStatus.delayed },
      }),
      this.prisma.tripStatusLog.create({
        data: {
          tripId: trip.id,
          fromStatus: trip.status,
          toStatus: TripStatus.delayed,
          reason,
          changedById: actor.id,
        },
      }),
    ]);
  }

  /** Aviso por correo a administración y coordinación de las incidencias altas y críticas. */
  private async notify(incident: {
    id: string;
    folio: number;
    severity: IncidentSeverity;
    description: string;
    location: string | null;
    bus: { economicNumber: string };
    category: { name: string };
    reporter: { fullName: string };
    trip: { tripNumber: string } | null;
  }) {
    if (
      incident.severity !== IncidentSeverity.high &&
      incident.severity !== IncidentSeverity.critical
    )
      return;
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.admin, UserRole.coordinator] },
      },
      select: { email: true },
    });
    const folio = incidentFolio(incident.folio);
    const severity = INCIDENT_SEVERITY_LABELS[incident.severity].toLowerCase();
    const where = incident.trip
      ? `en el recorrido ${incident.trip.tripNumber}`
      : 'fuera de recorrido';
    const intro = `${incident.reporter.fullName} reportó una incidencia ${severity} (${incident.category.name}) de la unidad ${incident.bus.economicNumber} ${where}${
      incident.location ? `, en ${incident.location}` : ''
    }: ${incident.description}`;
    const url = `${this.appUrl}/flota/incidencias/${incident.id}`;
    // Un correo que falla no debe tumbar el reporte
    await Promise.all(
      recipients.map((r) =>
        this.mail
          .send({
            to: r.email,
            subject: `Incidencia ${severity} · unidad ${incident.bus.economicNumber} · ${folio}`,
            text: `${intro}\n\n${url}`,
            html: brandedEmail({
              title: `Incidencia ${folio}`,
              intro,
              action: { label: 'Ver incidencia', url },
              outro:
                incident.severity === IncidentSeverity.critical
                  ? 'La unidad quedó fuera de servicio. Si iba en un recorrido, este quedó retrasado: asigna otra unidad desde su ficha.'
                  : undefined,
            }),
          })
          .catch((err: Error) =>
            this.logger.error(`Aviso de ${folio} a ${r.email}: ${err.message}`),
          ),
      ),
    );
  }

  async create(dto: CreateIncidentDto, actor: AuthUser) {
    const trip = await this.checkTrip(dto, actor);
    const [, category] = await Promise.all([
      this.prisma.bus.findUniqueOrThrow({ where: { id: dto.busId } }),
      this.getCategory(dto.categoryId),
    ]);
    this.assertOccurredAt(dto.occurredAt);
    const { occurredAt, ...data } = dto;
    const incident = await this.prisma.busIncident.create({
      data: {
        ...data,
        ...this.accidentData(category.isAccident),
        occurredAt: new Date(occurredAt),
        reportedBy: actor.id,
      },
      include: incidentInclude,
    });
    await this.log(actor, incident.id, ActionType.insert, null, incident);
    if (trip && incident.severity === IncidentSeverity.critical)
      await this.delayTrip(
        trip,
        `${incidentFolio(incident.folio)} · ${category.name}: ${incident.description}`,
        actor,
      );
    void this.notify(incident);
    // Si la saca de servicio o retrasa el recorrido, lo que se devuelve cambió
    return (await this.applyCritical(incident, actor)) || trip
      ? this.getIncident(incident.id, actor)
      : incident;
  }

  async update(id: string, dto: UpdateIncidentDto, actor: AuthUser) {
    const before = await this.getIncident(id, actor);
    if (!isOpenIncident(before.status))
      throw new BadRequestException('La incidencia ya está cerrada');
    if (!isReviewer(actor) && !reporterCanEdit(before.status))
      throw new BadRequestException(
        'La incidencia ya está en revisión; pide a coordinación que la corrija',
      );
    const category = dto.categoryId
      ? await this.getCategory(dto.categoryId)
      : before.category;
    if (dto.occurredAt) this.assertOccurredAt(dto.occurredAt);
    const { occurredAt, ...data } = dto;
    const incident = await this.prisma.busIncident.update({
      where: { id },
      data: {
        ...data,
        ...this.accidentData(category.isAccident),
        ...(occurredAt && { occurredAt: new Date(occurredAt) }),
      },
      include: incidentInclude,
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      { ...before, orders: undefined },
      { ...incident, orders: undefined },
    );
    // Cambió la gravedad: sacar o regresar la unidad según corresponda
    if (incident.severity === IncidentSeverity.critical)
      await this.applyCritical(incident, actor);
    else await this.releaseFromIncident(incident, actor);
    return this.getIncident(id, actor);
  }

  // ---------- Atención ----------

  /** La supervisión o coordinación toma la incidencia. */
  async review(id: string, actor: AuthUser) {
    const incident = await this.getIncident(id, actor);
    if (incident.status !== IncidentStatus.reported)
      throw new BadRequestException('La incidencia ya fue revisada');
    return this.markReviewed(incident.id, incident.status, actor);
  }

  private async markReviewed(
    id: string,
    from: IncidentStatus,
    actor: AuthUser,
  ) {
    const updated = await this.prisma.busIncident.update({
      where: { id },
      data: {
        status: IncidentStatus.in_review,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      },
      include: incidentInclude,
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: from },
      { status: updated.status },
    );
    return updated;
  }

  /** Crea la orden correctiva ligada; la incidencia pasa a en revisión. */
  async createOrder(id: string, dto: IncidentOrderDto, actor: AuthUser) {
    const incident = await this.getIncident(id, actor);
    if (!isOpenIncident(incident.status))
      throw new BadRequestException('La incidencia ya está cerrada');
    const open = incident.orders.find((o) => OPEN_ORDER.includes(o.status));
    if (open)
      throw new BadRequestException(
        `La incidencia ya tiene una orden abierta (OT-${open.folio})`,
      );
    const order = await this.maintenance.create(
      {
        ...dto,
        busId: incident.busId,
        type: MaintenanceType.corrective,
        priority:
          dto.priority ??
          (incident.severity === IncidentSeverity.critical ||
          incident.severity === IncidentSeverity.high
            ? 'urgent'
            : 'normal'),
        description:
          dto.description ??
          `${incidentFolio(incident.folio)} · ${incident.category.name}: ${incident.description}`,
      },
      actor,
      incident.id,
    );
    if (incident.status === IncidentStatus.reported)
      await this.markReviewed(incident.id, incident.status, actor);
    return order;
  }

  async resolve(id: string, dto: CloseIncidentDto, actor: AuthUser) {
    return this.close(id, IncidentStatus.resolved, dto, actor);
  }

  async dismiss(id: string, dto: CloseIncidentDto, actor: AuthUser) {
    return this.close(id, IncidentStatus.dismissed, dto, actor);
  }

  private async close(
    id: string,
    status: IncidentStatus,
    dto: CloseIncidentDto,
    actor: AuthUser,
  ) {
    const incident = await this.getIncident(id, actor);
    if (!isOpenIncident(incident.status))
      throw new BadRequestException('La incidencia ya está cerrada');
    const open = incident.orders.find((o) => OPEN_ORDER.includes(o.status));
    if (open)
      throw new BadRequestException(
        `Tiene la orden OT-${open.folio} abierta; se resuelve al terminarla o cancélala primero`,
      );
    const now = new Date();
    const updated = await this.prisma.busIncident.update({
      where: { id },
      data: {
        status,
        resolution: dto.resolution,
        closedAt: now,
        // Si nadie la había revisado, quien la cierra cuenta como revisor
        ...(!incident.reviewedBy && { reviewedBy: actor.id, reviewedAt: now }),
      },
      include: incidentInclude,
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      { status: incident.status },
      { status, resolution: dto.resolution },
    );
    await this.releaseFromIncident(incident, actor);
    return this.getIncident(updated.id, actor);
  }

  // ---------- Catálogo de categorías ----------

  categories(includeInactive = false) {
    return this.prisma.incidentCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: IncidentCategoryDto, actor: AuthUser) {
    const last = await this.prisma.incidentCategory.aggregate({
      _max: { sortOrder: true },
    });
    const row = await this.prisma.incidentCategory.create({
      data: {
        ...dto,
        sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
      },
    });
    await this.log(
      actor,
      row.id,
      ActionType.insert,
      null,
      row,
      'incident_categories',
    );
    return row;
  }

  async updateCategory(
    id: string,
    dto: UpdateIncidentCategoryDto,
    actor: AuthUser,
  ) {
    const before = await this.prisma.incidentCategory.findUniqueOrThrow({
      where: { id },
    });
    const row = await this.prisma.incidentCategory.update({
      where: { id },
      data: dto,
    });
    await this.log(
      actor,
      id,
      ActionType.update,
      before,
      row,
      'incident_categories',
    );
    return row;
  }
}
