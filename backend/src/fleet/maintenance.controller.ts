import {
  Body,
  Controller,
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
  AddTaskDto,
  CancelOrderDto,
  CompleteOrderDto,
  CreateMaintenanceOrderDto,
  QueryMaintenanceDto,
  StartOrderDto,
  TaskTemplateDto,
  ToggleTaskDto,
  UpdateMaintenanceOrderDto,
  UpdateTaskTemplateDto,
} from './dto/maintenance.dto.js';
import { CatalogQueryDto } from './dto/fleet.dto.js';
import { FLEET_EDITORS, FLEET_READERS } from './fleet.controller.js';
import { MaintenanceService } from './maintenance.service.js';

/** El mecánico consulta y trabaja órdenes; no las crea ni las cancela. */
const READERS = [...FLEET_READERS, UserRole.mechanic];
const WORKERS = [...FLEET_EDITORS, UserRole.mechanic];

@ApiTags('fleet')
@ApiBearerAuth()
@Roles(...FLEET_EDITORS)
@Controller('fleet/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('plan')
  @Roles(...FLEET_READERS)
  plan() {
    return this.maintenance.plan();
  }

  @Get('plan/:busId')
  @Roles(...FLEET_READERS)
  busPlan(@Param('busId', ParseUUIDPipe) busId: string) {
    return this.maintenance.plan(busId).then((rows) => rows[0] ?? null);
  }

  @Get('summary')
  @Roles(...READERS)
  summary(@CurrentUser() actor: AuthUser) {
    return this.maintenance.summary(actor);
  }

  @Get('mechanics')
  @Roles(...FLEET_READERS)
  mechanics() {
    return this.maintenance.mechanics();
  }

  @Get('task-templates')
  @Roles(...READERS)
  templates(@Query() q: CatalogQueryDto) {
    return this.maintenance.templates(q.includeInactive);
  }

  @Post('task-templates')
  createTemplate(@Body() dto: TaskTemplateDto, @CurrentUser() actor: AuthUser) {
    return this.maintenance.createTemplate(dto, actor);
  }

  @Patch('task-templates/:id')
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskTemplateDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.updateTemplate(id, dto, actor);
  }

  @Get('orders')
  @Roles(...READERS)
  findAll(@Query() q: QueryMaintenanceDto, @CurrentUser() actor: AuthUser) {
    return this.maintenance.findAll(q, actor);
  }

  @Get('orders/:id')
  @Roles(...READERS)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.findOne(id, actor);
  }

  @Post('orders')
  create(
    @Body() dto: CreateMaintenanceOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.create(dto, actor);
  }

  @Patch('orders/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.update(id, dto, actor);
  }

  @Post('orders/:id/start')
  @HttpCode(200)
  @Roles(...WORKERS)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.start(id, dto, actor);
  }

  @Post('orders/:id/complete')
  @HttpCode(200)
  @Roles(...WORKERS)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.complete(id, dto, actor);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.cancel(id, dto, actor);
  }

  @Post('orders/:id/tasks')
  @Roles(...WORKERS)
  addTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTaskDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.addTask(id, dto, actor);
  }

  @Patch('orders/:id/tasks/:taskId')
  @Roles(...WORKERS)
  toggleTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ToggleTaskDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.maintenance.toggleTask(id, taskId, dto.isDone, actor);
  }
}
