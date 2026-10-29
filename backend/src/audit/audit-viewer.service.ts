import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, today, zonedDateTime } from '../common/dates.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { SecurityEventType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { DEFAULT_BUSINESS_TIMEZONE } from '../common/dates.js';
import {
  AuditLogQueryDto,
  SecurityEventQueryDto,
} from './dto/audit-query.dto.js';

const userSelect = {
  select: { id: true, fullName: true, email: true },
} as const;
const EXPORT_LIMIT = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rango de fechas locales (CDMX) a instantes: desde el inicio de `from` hasta el fin de `to`. */
function createdBetween(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    gte: from ? zonedDateTime(from, '00:00') : undefined,
    lt: to
      ? new Date(zonedDateTime(to, '00:00').getTime() + DAY_MS)
      : undefined,
  };
}

/** Consulta de la bitácora de cambios y de eventos de seguridad (solo admin). */
@Injectable()
export class AuditViewerService {
  private readonly logger = new Logger(AuditViewerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private logWhere(q: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    return {
      userId: q.userId,
      tableName: q.tableName,
      actionType: q.actionType,
      recordId: q.recordId,
      createdAt: createdBetween(q.from, q.to),
    };
  }

  async logs(q: AuditLogQueryDto) {
    const where = this.logWhere(q);
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: userSelect },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  /** Tablas y usuarios que aparecen en la bitácora, para los filtros. */
  async filters() {
    const [tables, users] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['tableName'],
        _count: { _all: true },
        orderBy: { tableName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          OR: [{ auditLogs: { some: {} } }, { securityEvents: { some: {} } }],
        },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return {
      tables: tables.map((t) => ({ name: t.tableName, count: t._count._all })),
      users,
    };
  }

  async securityEvents(q: SecurityEventQueryDto) {
    const where: Prisma.SecurityEventWhereInput = {
      type: q.type,
      userId: q.userId,
      createdAt: createdBetween(q.from, q.to),
      ...(q.search && {
        OR: [
          { email: { contains: q.search, mode: 'insensitive' } },
          { ipAddress: { contains: q.search } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        include: { user: userSelect },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.securityEvent.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  /** Cifras de las últimas 24 horas para la banda. */
  async summary() {
    const since = new Date(Date.now() - DAY_MS);
    const count = (type: SecurityEventType) =>
      this.prisma.securityEvent.count({
        where: { type, createdAt: { gte: since } },
      });
    const [changes, logins, failed, locked, retentionDays] = await Promise.all([
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      count(SecurityEventType.login_success),
      count(SecurityEventType.login_failed),
      count(SecurityEventType.account_locked),
      this.settings.get('audit.retention_days'),
    ]);
    return { changes, logins, failed, locked, retentionDays };
  }

  /** CSV de los cambios filtrados (máximo 10,000 filas). */
  async exportLogs(q: AuditLogQueryDto) {
    const rows = await this.prisma.auditLog.findMany({
      where: this.logWhere(q),
      include: { user: userSelect },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    const esc = (v: unknown) => {
      const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Fecha',
      'Usuario',
      'Correo',
      'Acción',
      'Tabla',
      'Registro',
      'Antes',
      'Después',
    ];
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.user?.fullName,
        r.user?.email,
        r.actionType,
        r.tableName,
        r.recordId,
        r.oldValues,
        r.newValues,
      ]
        .map(esc)
        .join(','),
    );
    return '﻿' + [header.join(','), ...lines].join('\r\n');
  }

  /** Borra lo que pasó el periodo de retención. Corre todas las noches. */
  @Cron('0 3 * * *', { timeZone: DEFAULT_BUSINESS_TIMEZONE })
  async purge() {
    const days = await this.settings.get('audit.retention_days');
    const cutoff = addDays(today(), -days);
    const [logs, events] = await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.securityEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      }),
    ]);
    if (logs.count || events.count)
      this.logger.log(
        `Bitácora depurada: ${logs.count} cambios y ${events.count} eventos anteriores a ${days} días`,
      );
    return { logs: logs.count, events: events.count, cutoff };
  }
}
