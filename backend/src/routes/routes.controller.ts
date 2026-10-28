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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import {
  CreateRouteDto,
  QueryRoutesDto,
  UpdateRouteDto,
} from './dto/route.dto.js';
import { CreateSchedulesDto, UpdateScheduleDto } from './dto/schedule.dto.js';
import { ReplaceStopsDto } from './dto/stop.dto.js';
import { FaresQueryDto } from './dto/season.dto.js';
import { RoutesService } from './routes.service.js';
import { SchedulesService } from './schedules.service.js';

/** Coordinación (y admin) administra las rutas; supervisión y taquilla las consultan. */
export const ROUTE_READERS = [
  UserRole.coordinator,
  UserRole.supervisor,
  UserRole.vendor,
];
export const ROUTE_EDITORS = [UserRole.coordinator];

@ApiTags('routes')
@ApiBearerAuth()
@Roles(...ROUTE_EDITORS)
@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly schedules: SchedulesService,
  ) {}

  @Get('summary')
  @Roles(...ROUTE_READERS)
  summary() {
    return this.routes.summary();
  }

  @Get('form-options')
  formOptions() {
    return this.routes.formOptions();
  }

  @Get()
  @Roles(...ROUTE_READERS)
  findAll(@Query() q: QueryRoutesDto) {
    return this.routes.findAll(q);
  }

  @Get(':id')
  @Roles(...ROUTE_READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRouteDto, @CurrentUser() actor: AuthUser) {
    return this.routes.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.routes.update(id, dto, actor);
  }

  @Get(':id/fares')
  @Roles(...ROUTE_READERS)
  fares(@Param('id', ParseUUIDPipe) id: string, @Query() q: FaresQueryDto) {
    return this.routes.fares(id, q.date);
  }

  // ---------- Paradas ----------

  @Put(':id/stops')
  replaceStops(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceStopsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.routes.replaceStops(id, dto, actor);
  }

  // ---------- Horarios ----------

  @Get(':id/schedules')
  @Roles(...ROUTE_READERS)
  listSchedules(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.list(id);
  }

  @Post(':id/schedules')
  createSchedules(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSchedulesDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.schedules.create(id, dto, actor);
  }

  @Patch(':id/schedules/:scheduleId')
  updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.schedules.update(id, scheduleId, dto, actor);
  }

  @Delete(':id/schedules/:scheduleId')
  @HttpCode(204)
  removeSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.schedules.remove(id, scheduleId, actor);
  }
}
