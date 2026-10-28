import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  CreateFuelLoadDto,
  QueryFuelEfficiencyDto,
  QueryFuelLoadDto,
  RejectFuelLoadDto,
  UpdateFuelLoadDto,
} from './dto/fuel.dto.js';
import { FLEET_EDITORS, FLEET_READERS } from './fleet.controller.js';
import { FuelService } from './fuel.service.js';

/** Registran: coordinación (confirmadas) y el conductor (por confirmar, solo ve las suyas). */
const RECORDERS = [...FLEET_READERS, UserRole.driver];

@ApiTags('fleet')
@ApiBearerAuth()
@Roles(...FLEET_READERS)
@Controller('fleet/fuel')
export class FuelController {
  constructor(private readonly fuel: FuelService) {}

  @Get('summary')
  @Roles(...RECORDERS)
  summary(@CurrentUser() actor: AuthUser) {
    return this.fuel.summary(actor);
  }

  @Get('form-options')
  @Roles(...RECORDERS)
  formOptions() {
    return this.fuel.formOptions();
  }

  @Get('efficiency')
  efficiency(@Query() q: QueryFuelEfficiencyDto) {
    return this.fuel.efficiency(q.busId);
  }

  @Get()
  @Roles(...RECORDERS)
  findAll(@Query() q: QueryFuelLoadDto, @CurrentUser() actor: AuthUser) {
    return this.fuel.findAll(q, actor);
  }

  @Get(':id')
  @Roles(...RECORDERS)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fuel.findOne(id, actor);
  }

  @Post()
  @Roles(...FLEET_EDITORS, UserRole.driver)
  create(@Body() dto: CreateFuelLoadDto, @CurrentUser() actor: AuthUser) {
    return this.fuel.create(dto, actor);
  }

  @Patch(':id')
  @Roles(...FLEET_EDITORS, UserRole.driver)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelLoadDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fuel.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...FLEET_EDITORS, UserRole.driver)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fuel.remove(id, actor);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(...FLEET_EDITORS)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fuel.confirm(id, actor);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(...FLEET_EDITORS)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectFuelLoadDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fuel.reject(id, dto, actor);
  }
}
