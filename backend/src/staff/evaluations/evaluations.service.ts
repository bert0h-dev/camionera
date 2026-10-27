import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { toDate } from '../../common/dates.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ActionType,
  AttendanceStatus,
  EvaluationStatus,
  StaffStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AcknowledgeEvaluationDto,
  CreateCriterionDto,
  CreateEvaluationDto,
  QueryEvaluationsDto,
  UpdateCriterionDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto.js';
import {
  criterionApplies,
  missingScores,
  weightedScore,
} from './evaluation-rules.js';

const TABLE = 'staff_evaluations';
const CRITERIA_TABLE = 'evaluation_criteria';

const staffSelect = {
  select: {
    id: true,
    employeeNumber: true,
    firstName: true,
    lastName: true,
    secondLastName: true,
    role: true,
    status: true,
    userId: true,
  },
} satisfies Prisma.StaffDefaultArgs;

const evaluationInclude = {
  staff: staffSelect,
  evaluator: { select: { id: true, fullName: true } },
  scores: {
    orderBy: { criterion: { sortOrder: 'asc' } },
    include: { criterion: { select: { description: true } } },
  },
} satisfies Prisma.StaffEvaluationInclude;

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Criterios ----------

  findCriteria(includeInactive: boolean) {
    return this.prisma.evaluationCriterion.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCriterion(dto: CreateCriterionDto, actor: AuthUser) {
    const criterion = await this.prisma.evaluationCriterion.create({
      data: dto,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: CRITERIA_TABLE,
      recordId: criterion.id,
      actionType: ActionType.insert,
      newValues: criterion,
    });
    return criterion;
  }

  async updateCriterion(id: string, dto: UpdateCriterionDto, actor: AuthUser) {
    const before = await this.prisma.evaluationCriterion.findUniqueOrThrow({
      where: { id },
    });
    const criterion = await this.prisma.evaluationCriterion.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: CRITERIA_TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: criterion,
    });
    return criterion;
  }

  // ---------- Evaluaciones ----------

  async findAll(query: QueryEvaluationsDto) {
    const where: Prisma.StaffEvaluationWhereInput = {
      staffId: query.staffId,
      status: query.status,
      periodEnd: query.from ? { gte: toDate(query.from) } : undefined,
      periodStart: query.to ? { lte: toDate(query.to) } : undefined,
    };
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.staff = {
        OR: [
          { firstName: contains },
          { lastName: contains },
          { employeeNumber: contains },
        ],
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.staffEvaluation.findMany({
        where,
        include: {
          staff: staffSelect,
          evaluator: { select: { id: true, fullName: true } },
        },
        orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.staffEvaluation.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  /** Detalle con el resumen de asistencia del periodo como referencia. */
  async findOne(id: string) {
    const evaluation = await this.prisma.staffEvaluation.findUniqueOrThrow({
      where: { id },
      include: evaluationInclude,
    });
    return {
      ...evaluation,
      attendance: await this.attendanceSummary(
        evaluation.staffId,
        evaluation.periodStart,
        evaluation.periodEnd,
      ),
    };
  }

  async create(dto: CreateEvaluationDto, actor: AuthUser) {
    const periodStart = toDate(dto.periodStart);
    const periodEnd = toDate(dto.periodEnd);
    if (periodEnd < periodStart)
      throw new BadRequestException(
        'El fin del periodo debe ser posterior al inicio',
      );

    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: dto.staffId },
    });
    if (staff.status === StaffStatus.inactive)
      throw new BadRequestException('No se puede evaluar a un empleado dado de baja');
    this.assertNotSelf(staff.userId, actor);

    const overlap = await this.prisma.staffEvaluation.findFirst({
      where: {
        staffId: staff.id,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
    });
    if (overlap)
      throw new ConflictException(
        'Ya existe una evaluación de este empleado que se traslapa con ese periodo',
      );

    const criteria = (
      await this.prisma.evaluationCriterion.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
    ).filter((c) => criterionApplies(c, staff.role));
    if (criteria.length === 0)
      throw new BadRequestException(
        'No hay criterios activos que apliquen a este puesto',
      );

    const evaluation = await this.prisma.staffEvaluation.create({
      data: {
        staffId: staff.id,
        evaluatorId: actor.id,
        periodStart,
        periodEnd,
        scores: {
          create: criteria.map((c) => ({
            criterionId: c.id,
            criterionName: c.name,
            weight: c.weight,
          })),
        },
      },
      include: evaluationInclude,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: evaluation.id,
      actionType: ActionType.insert,
      newValues: { staffId: staff.id, periodStart, periodEnd },
    });
    return evaluation;
  }

  async update(id: string, dto: UpdateEvaluationDto, actor: AuthUser) {
    const before = await this.loadDraft(id, actor);
    const { scores, ...texts } = dto;

    if (scores?.length) {
      const known = new Set(before.scores.map((s) => s.criterionId));
      const unknown = scores.find((s) => !known.has(s.criterionId));
      if (unknown)
        throw new BadRequestException(
          'Un criterio no pertenece a esta evaluación',
        );
    }

    const evaluation = await this.prisma.$transaction(async (tx) => {
      for (const s of scores ?? []) {
        await tx.staffEvaluationScore.update({
          where: {
            evaluationId_criterionId: {
              evaluationId: id,
              criterionId: s.criterionId,
            },
          },
          data: { score: s.score, comment: s.comment },
        });
      }
      const current = await tx.staffEvaluationScore.findMany({
        where: { evaluationId: id },
      });
      return tx.staffEvaluation.update({
        where: { id },
        data: { ...texts, overallScore: weightedScore(current) },
        include: evaluationInclude,
      });
    });

    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: { overallScore: before.overallScore },
      newValues: dto,
    });
    return evaluation;
  }

  async finalize(id: string, actor: AuthUser) {
    const draft = await this.loadDraft(id, actor);
    const missing = missingScores(draft.scores);
    if (missing.length)
      throw new BadRequestException(
        `Faltan calificar: ${missing.map((s) => s.criterionName).join(', ')}`,
      );

    const evaluation = await this.prisma.staffEvaluation.update({
      where: { id },
      data: {
        status: EvaluationStatus.finalized,
        finalizedAt: new Date(),
        overallScore: weightedScore(draft.scores),
      },
      include: evaluationInclude,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: { status: draft.status },
      newValues: { status: evaluation.status },
    });
    return evaluation;
  }

  async remove(id: string, actor: AuthUser) {
    const draft = await this.loadDraft(id, actor);
    await this.prisma.staffEvaluation.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.delete,
      oldValues: {
        staffId: draft.staffId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
      },
    });
  }

  // ---------- Empleado ----------

  /** Evaluaciones finalizadas del propio empleado. */
  async mine(user: AuthUser) {
    const staff = await this.staffOfUser(user);
    return this.prisma.staffEvaluation.findMany({
      where: {
        staffId: staff.id,
        status: { not: EvaluationStatus.draft },
      },
      include: evaluationInclude,
      orderBy: { periodEnd: 'desc' },
    });
  }

  async acknowledge(id: string, dto: AcknowledgeEvaluationDto, user: AuthUser) {
    const staff = await this.staffOfUser(user);
    const evaluation = await this.prisma.staffEvaluation.findUnique({
      where: { id },
    });
    if (!evaluation || evaluation.staffId !== staff.id)
      throw new NotFoundException('Evaluación no encontrada');
    if (evaluation.status !== EvaluationStatus.finalized)
      throw new BadRequestException(
        evaluation.status === EvaluationStatus.draft
          ? 'La evaluación aún no está finalizada'
          : 'Ya marcaste esta evaluación como enterado',
      );

    const updated = await this.prisma.staffEvaluation.update({
      where: { id },
      data: {
        status: EvaluationStatus.acknowledged,
        acknowledgedAt: new Date(),
        employeeComment: dto.employeeComment,
      },
      include: evaluationInclude,
    });
    await this.audit.log({
      userId: user.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: { status: evaluation.status },
      newValues: { status: updated.status, employeeComment: dto.employeeComment },
    });
    return updated;
  }

  // ---------- Auxiliares ----------

  private assertNotSelf(staffUserId: string | null, actor: AuthUser) {
    if (staffUserId && staffUserId === actor.id)
      throw new ForbiddenException('No puedes evaluarte a ti mismo');
  }

  private async loadDraft(id: string, actor: AuthUser) {
    const evaluation = await this.prisma.staffEvaluation.findUniqueOrThrow({
      where: { id },
      include: { scores: true, staff: { select: { userId: true } } },
    });
    this.assertNotSelf(evaluation.staff.userId, actor);
    if (evaluation.status !== EvaluationStatus.draft)
      throw new BadRequestException(
        'La evaluación ya está finalizada y no se puede modificar',
      );
    return evaluation;
  }

  private async staffOfUser(user: AuthUser) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: user.id },
    });
    if (!staff)
      throw new NotFoundException('Tu usuario no está ligado a un empleado');
    return staff;
  }

  private async attendanceSummary(staffId: string, from: Date, to: Date) {
    const where = { staffId, attendanceDate: { gte: from, lte: to } };
    const [byStatus, totals] = await Promise.all([
      this.prisma.staffAttendance.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.staffAttendance.aggregate({
        where,
        _sum: { lateMinutes: true, overtimeMinutes: true },
      }),
    ]);
    const count = (s: AttendanceStatus) =>
      byStatus.find((r) => r.status === s)?._count._all ?? 0;
    return {
      present: count(AttendanceStatus.present),
      late: count(AttendanceStatus.late),
      halfDay: count(AttendanceStatus.half_day),
      absent: count(AttendanceStatus.absent),
      excused: count(AttendanceStatus.excused),
      lateMinutes: totals._sum.lateMinutes ?? 0,
      overtimeMinutes: totals._sum.overtimeMinutes ?? 0,
    };
  }
}
