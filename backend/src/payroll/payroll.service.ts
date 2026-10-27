import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateKey, toDate } from '../common/dates.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ActionType,
  PaymentFrequency,
  PayrollStatus,
  StaffStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { fullNameOf } from '../staff/staff.service.js';
import {
  CreateAdjustmentDto,
  CreateCompensationDto,
  CreatePeriodDto,
  PayrollSettingsDto,
  QueryPeriodsDto,
} from './dto/payroll.dto.js';
import { computePayroll, totals } from './payroll-rules.js';

const MAX_PERIOD_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

const staffSelect = {
  select: {
    id: true,
    employeeNumber: true,
    firstName: true,
    lastName: true,
    secondLastName: true,
    role: true,
    status: true,
  },
} satisfies Prisma.StaffDefaultArgs;

const fmt = (d: Date) => {
  const [y, m, day] = dateKey(d).split('-');
  return `${day}/${m}/${y}`;
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- Configuración ----------

  async getSettings() {
    const [latePenaltyEnabled, latesPerAbsence] = await Promise.all([
      this.settings.get('payroll.late_penalty_enabled'),
      this.settings.get('payroll.lates_per_absence'),
    ]);
    return { latePenaltyEnabled, latesPerAbsence };
  }

  async updateSettings(dto: PayrollSettingsDto, actor: AuthUser) {
    if (dto.latePenaltyEnabled !== undefined)
      await this.settings.set(
        'payroll.late_penalty_enabled',
        dto.latePenaltyEnabled,
        actor.id,
      );
    if (dto.latesPerAbsence !== undefined)
      await this.settings.set(
        'payroll.lates_per_absence',
        dto.latesPerAbsence,
        actor.id,
      );
    return this.getSettings();
  }

  // ---------- Salarios ----------

  async compensations(staffId: string) {
    await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
    return this.prisma.staffCompensation.findMany({
      where: { staffId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  async addCompensation(
    staffId: string,
    dto: CreateCompensationDto,
    actor: AuthUser,
  ) {
    await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
    const comp = await this.prisma.staffCompensation.create({
      data: {
        staffId,
        paymentType: dto.paymentType,
        baseSalary: dto.baseSalary,
        paymentFrequency: dto.paymentFrequency,
        effectiveFrom: toDate(dto.effectiveFrom),
        notes: dto.notes,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'staff_compensations',
      recordId: comp.id,
      actionType: ActionType.insert,
      newValues: comp,
    });
    return comp;
  }

  // ---------- Periodos ----------

  async findPeriods(query: QueryPeriodsDto) {
    const where: Prisma.PayrollPeriodWhereInput = { status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.payrollPeriod.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { entries: true } } },
      }),
      this.prisma.payrollPeriod.count({ where }),
    ]);
    // Neto por periodo para la lista
    const sums = await this.prisma.payrollEntry.groupBy({
      by: ['periodId'],
      where: { periodId: { in: data.map((p) => p.id) } },
      _sum: { netPay: true },
    });
    const netOf = new Map(sums.map((s) => [s.periodId, s._sum.netPay]));
    return paginate(
      data.map((p) => ({ ...p, netTotal: netOf.get(p.id) ?? 0 })),
      total,
      query,
    );
  }

  async createPeriod(dto: CreatePeriodDto, actor: AuthUser) {
    const periodStart = toDate(dto.periodStart);
    const periodEnd = toDate(dto.periodEnd);
    if (periodEnd < periodStart)
      throw new BadRequestException(
        'El fin del periodo debe ser posterior al inicio',
      );
    if (
      (periodEnd.getTime() - periodStart.getTime()) / DAY_MS + 1 >
      MAX_PERIOD_DAYS
    )
      throw new BadRequestException(
        `Un periodo no puede pasar de ${MAX_PERIOD_DAYS} días`,
      );

    const overlap = await this.prisma.payrollPeriod.findFirst({
      where: {
        frequency: dto.frequency,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
    });
    if (overlap)
      throw new ConflictException(
        `Se traslapa con el periodo "${overlap.name}"`,
      );

    const kind =
      dto.frequency === PaymentFrequency.weekly ? 'Semana' : 'Quincena';
    const period = await this.prisma.payrollPeriod.create({
      data: {
        name: dto.name ?? `${kind} ${fmt(periodStart)} – ${fmt(periodEnd)}`,
        frequency: dto.frequency,
        periodStart,
        periodEnd,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'payroll_periods',
      recordId: period.id,
      actionType: ActionType.insert,
      newValues: period,
    });
    return period;
  }

  /** Detalle con líneas, totales y avisos (empleados sin salario capturado). */
  async findPeriod(id: string) {
    const period = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        entries: {
          include: {
            staff: staffSelect,
            adjustments: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: [
            { staff: { lastName: 'asc' } },
            { staff: { firstName: 'asc' } },
          ],
        },
      },
    });
    const sum = (
      k: 'totalPerceptions' | 'totalDeductions' | 'netPay' | 'overtimeAmount',
    ) => period.entries.reduce((t, e) => t + Number(e[k]), 0);
    const missingSalary = await this.staffWithoutSalary(period);
    return {
      ...period,
      totals: {
        employees: period.entries.length,
        perceptions: Math.round(sum('totalPerceptions') * 100) / 100,
        deductions: Math.round(sum('totalDeductions') * 100) / 100,
        net: Math.round(sum('netPay') * 100) / 100,
        overtime: Math.round(sum('overtimeAmount') * 100) / 100,
      },
      missingSalary,
    };
  }

  /** Calcula (o recalcula) las líneas desde las asistencias; conserva los ajustes manuales. */
  async generate(id: string, actor: AuthUser) {
    const period = await this.loadDraft(id);
    const latePolicy = await this.getSettings();
    const candidates = await this.eligibleStaff(period);

    const records = await this.prisma.staffAttendance.findMany({
      where: {
        staffId: { in: candidates.map((c) => c.staff.id) },
        attendanceDate: { gte: period.periodStart, lte: period.periodEnd },
      },
      select: {
        staffId: true,
        attendanceDate: true,
        status: true,
        overtimeMinutes: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const included = new Set<string>();
      for (const { staff, compensation } of candidates) {
        included.add(staff.id);
        const result = computePayroll({
          paymentType: compensation.paymentType,
          baseSalary: Number(compensation.baseSalary),
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          records: records
            .filter((r) => r.staffId === staff.id)
            .map((r) => ({
              date: r.attendanceDate,
              status: r.status,
              overtimeMinutes: r.overtimeMinutes,
            })),
          latePolicy: {
            enabled: latePolicy.latePenaltyEnabled,
            latesPerAbsence: latePolicy.latesPerAbsence,
          },
        });
        const existing = await tx.payrollEntry.findUnique({
          where: { periodId_staffId: { periodId: id, staffId: staff.id } },
          include: { adjustments: true },
        });
        const t = totals(
          result,
          (existing?.adjustments ?? []).map((a) => ({
            type: a.type,
            amount: Number(a.amount),
          })),
        );
        const data = {
          paymentType: compensation.paymentType,
          baseSalary: compensation.baseSalary,
          ...result,
          ...t,
        };
        await tx.payrollEntry.upsert({
          where: { periodId_staffId: { periodId: id, staffId: staff.id } },
          update: data,
          create: { periodId: id, staffId: staff.id, ...data },
        });
      }
      // Quien ya no aplica (baja o sin salario) sale del periodo
      await tx.payrollEntry.deleteMany({
        where: { periodId: id, staffId: { notIn: [...included] } },
      });
      await tx.payrollPeriod.update({
        where: { id },
        data: { generatedAt: new Date() },
      });
    });

    await this.audit.log({
      userId: actor.id,
      tableName: 'payroll_periods',
      recordId: id,
      actionType: ActionType.update,
      newValues: { generated: candidates.length },
    });
    return this.findPeriod(id);
  }

  async close(id: string, actor: AuthUser) {
    const period = await this.loadDraft(id);
    if (!period.generatedAt)
      throw new BadRequestException('Genera la nómina antes de cerrarla');
    return this.changeStatus(
      id,
      PayrollStatus.closed,
      { closedAt: new Date() },
      actor,
    );
  }

  async markPaid(id: string, actor: AuthUser) {
    const period = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id },
    });
    if (period.status !== PayrollStatus.closed)
      throw new BadRequestException(
        'Solo se puede marcar como pagada una nómina cerrada',
      );
    return this.changeStatus(
      id,
      PayrollStatus.paid,
      { paidAt: new Date() },
      actor,
    );
  }

  async removePeriod(id: string, actor: AuthUser) {
    const period = await this.loadDraft(id);
    await this.prisma.payrollPeriod.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      tableName: 'payroll_periods',
      recordId: id,
      actionType: ActionType.delete,
      oldValues: period,
    });
  }

  // ---------- Ajustes ----------

  async addAdjustment(
    entryId: string,
    dto: CreateAdjustmentDto,
    actor: AuthUser,
  ) {
    const entry = await this.loadDraftEntry(entryId);
    const adj = await this.prisma.payrollAdjustment.create({
      data: {
        entryId,
        type: dto.type,
        concept: dto.concept,
        amount: dto.amount,
        createdById: actor.id,
      },
    });
    await this.recalcEntry(entry.id);
    await this.audit.log({
      userId: actor.id,
      tableName: 'payroll_adjustments',
      recordId: adj.id,
      actionType: ActionType.insert,
      newValues: adj,
    });
    return adj;
  }

  async removeAdjustment(adjustmentId: string, actor: AuthUser) {
    const adj = await this.prisma.payrollAdjustment.findUniqueOrThrow({
      where: { id: adjustmentId },
    });
    await this.loadDraftEntry(adj.entryId);
    await this.prisma.payrollAdjustment.delete({ where: { id: adjustmentId } });
    await this.recalcEntry(adj.entryId);
    await this.audit.log({
      userId: actor.id,
      tableName: 'payroll_adjustments',
      recordId: adjustmentId,
      actionType: ActionType.delete,
      oldValues: adj,
    });
  }

  // ---------- Empleado ----------

  /** Recibos del propio empleado (solo periodos cerrados o pagados). */
  async mine(user: AuthUser) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: user.id },
    });
    if (!staff)
      throw new NotFoundException('Tu usuario no está ligado a un empleado');
    return this.prisma.payrollEntry.findMany({
      where: {
        staffId: staff.id,
        period: { status: { not: PayrollStatus.draft } },
      },
      include: {
        period: {
          select: {
            id: true,
            name: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            paidAt: true,
          },
        },
        adjustments: { select: { type: true, concept: true, amount: true } },
      },
      orderBy: { period: { periodStart: 'desc' } },
      take: 12,
    });
  }

  // ---------- Exportación ----------

  async export(id: string, format: 'csv' | 'xlsx') {
    const period = await this.findPeriod(id);
    const headers = [
      'No. empleado',
      'Nombre',
      'Puesto',
      'Tipo de pago',
      'Salario base',
      'Salario diario',
      'Días del periodo',
      'Días pagables',
      'Faltas',
      'Medios días',
      'Retardos',
      'Faltas por retardos',
      'Extras dobles (h)',
      'Extras triples (h)',
      'Domingos trabajados',
      'Sueldo',
      'Horas extra',
      'Prima dominical',
      'Otras percepciones',
      'Total percepciones',
      'Deducciones',
      'Neto a pagar',
    ];
    const rows = period.entries.map((e) => {
      const otherPerceptions = e.adjustments
        .filter((a) => a.type === 'perception')
        .reduce((t, a) => t + Number(a.amount), 0);
      return [
        e.staff.employeeNumber,
        fullNameOf(e.staff),
        e.staff.role,
        e.paymentType === 'daily' ? 'Diario' : 'Mensual',
        Number(e.baseSalary),
        Number(e.dailySalary),
        e.periodDays,
        Number(e.payableDays),
        e.absences,
        e.halfDays,
        e.lates,
        e.lateAbsences,
        Number(e.overtimeDouble),
        Number(e.overtimeTriple),
        e.sundaysWorked,
        Number(e.salaryAmount),
        Number(e.overtimeAmount),
        Number(e.sundayPremium),
        Math.round(otherPerceptions * 100) / 100,
        Number(e.totalPerceptions),
        Number(e.totalDeductions),
        Number(e.netPay),
      ];
    });
    const fileBase = `prenomina-${dateKey(period.periodStart)}_${dateKey(period.periodEnd)}`;

    if (format === 'csv') {
      const esc = (v: unknown) => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      // BOM para que Excel respete los acentos
      const body =
        '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
      return {
        buffer: Buffer.from(body, 'utf8'),
        filename: `${fileBase}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Central Camionera';
    const ws = wb.addWorksheet('Prenómina', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    ws.addRow([period.name]).font = { bold: true, size: 14 };
    ws.addRow([
      `Del ${fmt(period.periodStart)} al ${fmt(period.periodEnd)} · Estado: ${period.status}`,
    ]);
    const header = ws.addRow(headers);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF312E81' },
    };
    rows.forEach((r) => ws.addRow(r));
    const totalRow = ws.addRow([
      'TOTAL',
      `${period.totals.employees} empleados`,
      ...Array(17).fill(''),
      period.totals.perceptions,
      period.totals.deductions,
      period.totals.net,
    ]);
    totalRow.font = { bold: true };
    ws.columns.forEach((c, i) => {
      c.width = i === 1 ? 32 : 14;
      if (i >= 15 || i === 4 || i === 5) c.numFmt = '"$"#,##0.00';
    });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      buffer,
      filename: `${fileBase}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // ---------- Internos ----------

  private async loadDraft(id: string) {
    const period = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id },
    });
    if (period.status !== PayrollStatus.draft)
      throw new BadRequestException(
        'La nómina ya está cerrada y no se puede modificar',
      );
    return period;
  }

  private async loadDraftEntry(entryId: string) {
    const entry = await this.prisma.payrollEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: { period: true },
    });
    if (entry.period.status !== PayrollStatus.draft)
      throw new BadRequestException(
        'La nómina ya está cerrada y no se puede modificar',
      );
    return entry;
  }

  private async recalcEntry(entryId: string) {
    const entry = await this.prisma.payrollEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: { adjustments: true },
    });
    const t = totals(
      {
        salaryAmount: Number(entry.salaryAmount),
        overtimeAmount: Number(entry.overtimeAmount),
        sundayPremium: Number(entry.sundayPremium),
      },
      entry.adjustments.map((a) => ({
        type: a.type,
        amount: Number(a.amount),
      })),
    );
    await this.prisma.payrollEntry.update({ where: { id: entryId }, data: t });
  }

  private async changeStatus(
    id: string,
    status: PayrollStatus,
    data: Prisma.PayrollPeriodUpdateInput,
    actor: AuthUser,
  ) {
    const before = await this.prisma.payrollPeriod.findUniqueOrThrow({
      where: { id },
    });
    const period = await this.prisma.payrollPeriod.update({
      where: { id },
      data: { ...data, status },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'payroll_periods',
      recordId: id,
      actionType: ActionType.update,
      oldValues: { status: before.status },
      newValues: { status },
    });
    return period;
  }

  /**
   * Empleados que entran al periodo: no dados de baja antes de que empiece, con salario
   * vigente al cierre y con la misma periodicidad de pago que el periodo.
   */
  private async eligibleStaff(period: {
    periodStart: Date;
    periodEnd: Date;
    frequency: PaymentFrequency;
  }) {
    const staff = await this.prisma.staff.findMany({
      where: {
        hireDate: { lte: period.periodEnd },
        OR: [
          { status: { not: StaffStatus.inactive } },
          { terminationDate: { gte: period.periodStart } },
        ],
      },
      select: {
        id: true,
        compensations: {
          where: { effectiveFrom: { lte: period.periodEnd } },
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });
    return staff
      .filter((s) => s.compensations[0]?.paymentFrequency === period.frequency)
      .map((s) => ({ staff: s, compensation: s.compensations[0] }));
  }

  private async staffWithoutSalary(period: {
    periodStart: Date;
    periodEnd: Date;
  }) {
    return this.prisma.staff.findMany({
      where: {
        status: { not: StaffStatus.inactive },
        hireDate: { lte: period.periodEnd },
        compensations: { none: { effectiveFrom: { lte: period.periodEnd } } },
      },
      ...staffSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }
}
