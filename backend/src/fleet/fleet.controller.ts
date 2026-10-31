import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { BusModelsService } from './bus-models.service.js';
import { CatalogsService } from './catalogs.service.js';
import {
  CatalogQueryDto,
  TerminalQueryDto,
  CreateBusModelDto,
  CreateCityDto,
  CreateFuelTypeDto,
  CreatePlatformDto,
  CreateTerminalDto,
  DefaultLayoutQueryDto,
  QueryBusModelsDto,
  UpdateBusModelDto,
  UpdateCityDto,
  UpdateFuelTypeDto,
  UpdatePlatformDto,
  UpdateTerminalDto,
} from './dto/fleet.dto.js';

/** Coordinación (y admin) administra la flota; el supervisor la consulta. */
export const FLEET_READERS = [UserRole.coordinator, UserRole.supervisor];
export const FLEET_EDITORS = [UserRole.coordinator];

@ApiTags('fleet')
@ApiBearerAuth()
@Roles(...FLEET_EDITORS)
@Controller('fleet')
export class FleetCatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get('fuel-types')
  @Roles(...FLEET_READERS)
  fuelTypes(@Query() q: CatalogQueryDto) {
    return this.catalogs.fuelTypes(q.includeInactive);
  }

  @Post('fuel-types')
  createFuelType(
    @Body() dto: CreateFuelTypeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.createFuelType(dto, actor);
  }

  @Patch('fuel-types/:id')
  updateFuelType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelTypeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.updateFuelType(id, dto, actor);
  }

  @Get('cities')
  @Roles(...FLEET_READERS)
  cities(@Query() q: CatalogQueryDto) {
    return this.catalogs.cities(q.includeInactive);
  }

  @Post('cities')
  createCity(@Body() dto: CreateCityDto, @CurrentUser() actor: AuthUser) {
    return this.catalogs.createCity(dto, actor);
  }

  @Patch('cities/:id')
  updateCity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCityDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.updateCity(id, dto, actor);
  }

  @Get('terminals')
  @Roles(...FLEET_READERS)
  terminals(@Query() q: TerminalQueryDto) {
    return this.catalogs.terminals(q.includeInactive, q.located);
  }

  @Post('terminals')
  createTerminal(
    @Body() dto: CreateTerminalDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.createTerminal(dto, actor);
  }

  @Patch('terminals/:id')
  updateTerminal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTerminalDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.updateTerminal(id, dto, actor);
  }

  @Get('terminals/:id/platforms')
  @Roles(...FLEET_READERS, UserRole.vendor)
  platforms(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CatalogQueryDto,
  ) {
    return this.catalogs.platforms(id, q.includeInactive);
  }

  @Post('terminals/:id/platforms')
  createPlatform(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePlatformDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.createPlatform(id, dto, actor);
  }

  @Patch('platforms/:id')
  updatePlatform(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalogs.updatePlatform(id, dto, actor);
  }
}

@ApiTags('fleet')
@ApiBearerAuth()
@Roles(...FLEET_EDITORS)
@Controller('fleet/bus-models')
export class BusModelsController {
  constructor(private readonly models: BusModelsService) {}

  @Get()
  @Roles(...FLEET_READERS)
  findAll(@Query() q: QueryBusModelsDto) {
    return this.models.findAll(q);
  }

  /** Layout inicial típico (2 + pasillo + 2) para empezar a diseñar. */
  @Get('default-layout')
  @Roles(...FLEET_READERS)
  defaultLayout(@Query() q: DefaultLayoutQueryDto) {
    return this.models.defaultLayout(q.rows, q.floors);
  }

  @Get(':id')
  @Roles(...FLEET_READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.models.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBusModelDto, @CurrentUser() actor: AuthUser) {
    return this.models.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusModelDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.models.update(id, dto, actor);
  }
}
