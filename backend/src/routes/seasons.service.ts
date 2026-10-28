import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateKey, toDate, today } from '../common/dates.js';
import type { Season } from '../generated/prisma/client.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSeasonDto, UpdateSeasonDto } from './dto/season.dto.js';
import {
  findSeasonClash,
  seasonErrors,
  seasonOn,
  seasonStatus,
  type SeasonWindow,
} from './season-rules.js';

const TABLE = 'seasons';

const toWindow = (s: Season): SeasonWindow & { id: string } => ({
  id: s.id,
  name: s.name,
  seasonType: s.seasonType,
  validFrom: dateKey(s.validFrom),
  validUntil: dateKey(s.validUntil),
  priceModifierPercent: Number(s.priceModifierPercent),
  isActive: s.isActive,
});

/** Temporadas globales: ajustan el precio de todas las rutas según la fecha del viaje. */
@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private todayKey() {
    return dateKey(today());
  }

  private present(s: Season) {
    const todayKey = this.todayKey();
    return {
      ...toWindow(s),
      description: s.description,
      status: seasonStatus(toWindow(s), todayKey),
      // Las ya terminadas no se borran: explican por qué se cobró un precio
      canDelete: dateKey(s.validUntil) >= todayKey,
      updatedAt: s.updatedAt,
    };
  }

  async list(year?: number) {
    const rows = await this.prisma.season.findMany({
      where: year
        ? {
            validFrom: { lte: toDate(`${year}-12-31`) },
            validUntil: { gte: toDate(`${year}-01-01`) },
          }
        : undefined,
      orderBy: { validFrom: 'asc' },
    });
    return rows.map((s) => this.present(s));
  }

  /** Temporada vigente hoy y la siguiente activa, para las bandas. */
  async summary() {
    const todayKey = this.todayKey();
    const rows = (
      await this.prisma.season.findMany({
        where: { isActive: true, validUntil: { gte: today() } },
        orderBy: { validFrom: 'asc' },
      })
    ).map((s) => this.present(s));
    return {
      current: rows.find((s) => s.status === 'current') ?? null,
      next: rows.find((s) => s.validFrom > todayKey) ?? null,
    };
  }

  /** Temporada activa que aplica en la fecha del viaje ('AAAA-MM-DD'). */
  async on(date: string) {
    const d = toDate(date);
    const rows = await this.prisma.season.findMany({
      where: { isActive: true, validFrom: { lte: d }, validUntil: { gte: d } },
    });
    const found = seasonOn(rows.map(toWindow), date);
    return found ? { ...found, description: null } : null;
  }

  private async check(candidate: SeasonWindow) {
    const errors = seasonErrors(candidate);
    if (errors.length) throw new BadRequestException(errors);
    const existing = (
      await this.prisma.season.findMany({
        where: {
          isActive: true,
          id: candidate.id ? { not: candidate.id } : undefined,
        },
      })
    ).map(toWindow);
    const clash = findSeasonClash(candidate, existing);
    if (clash)
      throw new BadRequestException(
        `Se cruza con la temporada "${clash.name}" (${clash.validFrom} a ${clash.validUntil})`,
      );
  }

  async create(dto: CreateSeasonDto, actor: AuthUser) {
    await this.check({ ...dto, isActive: true });
    const row = await this.prisma.season.create({
      data: {
        ...dto,
        validFrom: toDate(dto.validFrom),
        validUntil: toDate(dto.validUntil),
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: row.id,
      actionType: ActionType.insert,
      oldValues: null,
      newValues: row,
    });
    return this.present(row);
  }

  async update(id: string, dto: UpdateSeasonDto, actor: AuthUser) {
    const before = await this.prisma.season.findUniqueOrThrow({
      where: { id },
    });
    const next: SeasonWindow = {
      ...toWindow(before),
      ...dto,
    } as SeasonWindow;
    await this.check(next);
    const row = await this.prisma.season.update({
      where: { id },
      data: {
        ...dto,
        validFrom: dto.validFrom ? toDate(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? toDate(dto.validUntil) : undefined,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: row,
    });
    return this.present(row);
  }

  async remove(id: string, actor: AuthUser) {
    const before = await this.prisma.season.findUniqueOrThrow({
      where: { id },
    });
    if (dateKey(before.validUntil) < this.todayKey())
      throw new BadRequestException(
        'La temporada ya terminó; desactívala en lugar de borrarla para conservar el historial',
      );
    await this.prisma.season.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.delete,
      oldValues: before,
      newValues: {},
    });
  }
}
