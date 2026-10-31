import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateCityDto,
  CreateFuelTypeDto,
  CreatePlatformDto,
  CreateTerminalDto,
  UpdateCityDto,
  UpdateFuelTypeDto,
  UpdatePlatformDto,
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
    if (dto.isActive === false && before.isActive)
      await this.assertNotInActiveRoutes({ cityId: id }, 'La ciudad');
    const row = await this.prisma.city.update({ where: { id }, data: dto });
    await this.log(actor, 'cities', id, ActionType.update, before, row);
    return row;
  }

  // ---------- Terminales ----------

  /** `located` = solo las que tienen ubicación, que son las únicas que se pueden usar en unidades y rutas. */
  terminals(includeInactive = false, located = false) {
    return this.prisma.terminal.findMany({
      where: {
        isActive: includeInactive ? undefined : true,
        ...(located && { latitude: { not: null }, longitude: { not: null } }),
      },
      include: {
        city: { select: { id: true, name: true, state: true, timezone: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  /** Para los módulos que asignan terminales: debe existir, estar activa y tener ubicación. */
  async assertUsableTerminal(id: string) {
    const t = await this.prisma.terminal.findUnique({ where: { id } });
    if (!t || !t.isActive)
      throw new BadRequestException('La terminal no existe o está desactivada');
    if (t.latitude === null || t.longitude === null)
      throw new BadRequestException(
        `La terminal ${t.code} no tiene ubicación; márcala en el mapa antes de usarla`,
      );
    return t;
  }

  /** Impide desactivar terminales (o ciudades) que una ruta activa usa como origen, destino o parada. */
  private async assertNotInActiveRoutes(
    terminal: Prisma.TerminalWhereInput,
    label: string,
  ) {
    const route = await this.prisma.route.findFirst({
      where: {
        isActive: true,
        OR: [
          { originTerminal: terminal },
          { destinationTerminal: terminal },
          { stops: { some: { terminal } } },
        ],
      },
      select: { code: true },
    });
    if (route)
      throw new BadRequestException(
        `${label} se usa en la ruta activa ${route.code}; desactiva primero la ruta`,
      );
  }

  async createTerminal(dto: CreateTerminalDto, actor: AuthUser) {
    checkCoordinates(dto.latitude, dto.longitude);
    const row = await this.prisma.terminal.create({ data: dto });
    await this.log(actor, 'terminals', row.id, ActionType.insert, null, row);
    return row;
  }

  async updateTerminal(id: string, dto: UpdateTerminalDto, actor: AuthUser) {
    const before = await this.prisma.terminal.findUniqueOrThrow({
      where: { id },
    });
    if (dto.latitude !== undefined || dto.longitude !== undefined)
      checkCoordinates(dto.latitude, dto.longitude);
    if (dto.isActive === false && before.isActive)
      await this.assertNotInActiveRoutes({ id }, 'La terminal');
    // Una terminal usada en rutas activas no puede quedarse sin ubicación
    if (dto.latitude === null && before.latitude !== null)
      await this.assertNotInActiveRoutes({ id }, 'La terminal');
    const row = await this.prisma.terminal.update({ where: { id }, data: dto });
    await this.log(actor, 'terminals', id, ActionType.update, before, row);
    return row;
  }

  // ---------- Andenes ----------

  platforms(terminalId: string, includeInactive = false) {
    return this.prisma.platform.findMany({
      where: { terminalId, isActive: includeInactive ? undefined : true },
      orderBy: { code: 'asc' },
    });
  }

  private async savePlatform<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
        throw new ConflictException('Ya existe un andén con esa clave');
      throw err;
    }
  }

  async createPlatform(
    terminalId: string,
    dto: CreatePlatformDto,
    actor: AuthUser,
  ) {
    await this.prisma.terminal.findUniqueOrThrow({ where: { id: terminalId } });
    const row = await this.savePlatform(() =>
      this.prisma.platform.create({ data: { ...dto, terminalId } }),
    );
    await this.log(actor, 'platforms', row.id, ActionType.insert, null, row);
    return row;
  }

  /** Desactivar un andén no lo quita de horarios ni recorridos; solo deja de ofrecerse. */
  async updatePlatform(id: string, dto: UpdatePlatformDto, actor: AuthUser) {
    const before = await this.prisma.platform.findUniqueOrThrow({
      where: { id },
    });
    const row = await this.savePlatform(() =>
      this.prisma.platform.update({ where: { id }, data: dto }),
    );
    await this.log(actor, 'platforms', id, ActionType.update, before, row);
    return row;
  }
}

/** Latitud y longitud van juntas: las dos o ninguna. */
function checkCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
) {
  if (((lat ?? null) === null) !== ((lng ?? null) === null))
    throw new BadRequestException('La ubicación necesita latitud y longitud');
}
