import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateCityDto,
  CreateFuelTypeDto,
  CreateTerminalDto,
  UpdateCityDto,
  UpdateFuelTypeDto,
  UpdateTerminalDto,
} from './dto/fleet.dto.js';

/** Catálogos de flota: combustibles, ciudades y terminales. No se borran, se desactivan. */
@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private log(
    actor: AuthUser,
    tableName: string,
    recordId: string,
    actionType: ActionType,
    before: object | null,
    after: object,
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

  // ---------- Combustibles ----------

  fuelTypes(includeInactive = false) {
    return this.prisma.fuelType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { _count: { select: { busModels: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createFuelType(dto: CreateFuelTypeDto, actor: AuthUser) {
    const row = await this.prisma.fuelType.create({ data: dto });
    await this.log(actor, 'fuel_types', row.id, ActionType.insert, null, row);
    return row;
  }

  async updateFuelType(id: string, dto: UpdateFuelTypeDto, actor: AuthUser) {
    const before = await this.prisma.fuelType.findUniqueOrThrow({
      where: { id },
    });
    const row = await this.prisma.fuelType.update({ where: { id }, data: dto });
    await this.log(actor, 'fuel_types', id, ActionType.update, before, row);
    return row;
  }

  // ---------- Ciudades ----------

  cities(includeInactive = false) {
    return this.prisma.city.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { _count: { select: { terminals: true } } },
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
    });
  }

  async createCity(dto: CreateCityDto, actor: AuthUser) {
    const row = await this.prisma.city.create({ data: dto });
    await this.log(actor, 'cities', row.id, ActionType.insert, null, row);
    return row;
  }

  async updateCity(id: string, dto: UpdateCityDto, actor: AuthUser) {
    const before = await this.prisma.city.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.city.update({ where: { id }, data: dto });
    await this.log(actor, 'cities', id, ActionType.update, before, row);
    return row;
  }

  // ---------- Terminales ----------

  terminals(includeInactive = false) {
    return this.prisma.terminal.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { city: { select: { id: true, name: true, state: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createTerminal(dto: CreateTerminalDto, actor: AuthUser) {
    const row = await this.prisma.terminal.create({ data: dto });
    await this.log(actor, 'terminals', row.id, ActionType.insert, null, row);
    return row;
  }

  async updateTerminal(id: string, dto: UpdateTerminalDto, actor: AuthUser) {
    const before = await this.prisma.terminal.findUniqueOrThrow({
      where: { id },
    });
    const row = await this.prisma.terminal.update({ where: { id }, data: dto });
    await this.log(actor, 'terminals', id, ActionType.update, before, row);
    return row;
  }
}
