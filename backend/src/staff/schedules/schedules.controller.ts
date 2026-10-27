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
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../generated/prisma/enums.js';
import {
  BulkScheduleDto,
  CreateScheduleDto,
  QuerySchedulesDto,
  UpdateScheduleDto,
} from './dto/schedule.dto.js';
import {
  CreateShiftTemplateDto,
  UpdateShiftTemplateDto,
} from './dto/shift-template.dto.js';
import { SchedulesService } from './schedules.service.js';
import { ShiftTemplatesService } from './shift-templates.service.js';

const READERS = [UserRole.hr, UserRole.supervisor, UserRole.coordinator];
// En el flujo 2.1.4 el supervisor programa turnos
const SCHEDULERS = [UserRole.hr, UserRole.supervisor];

@ApiTags('schedules')
@ApiBearerAuth()
@Roles(...SCHEDULERS)
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @Roles(...READERS)
  findAll(@Query() query: QuerySchedulesDto) {
    return this.schedules.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateScheduleDto, @CurrentUser() actor: AuthUser) {
    return this.schedules.create(dto, actor);
  }

  @Post('bulk')
  bulk(@Body() dto: BulkScheduleDto, @CurrentUser() actor: AuthUser) {
    return this.schedules.bulk(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.schedules.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.schedules.remove(id, actor);
  }
}

@ApiTags('schedules')
@ApiBearerAuth()
@Roles(UserRole.hr)
@Controller('shift-templates')
export class ShiftTemplatesController {
  constructor(private readonly templates: ShiftTemplatesService) {}

  @Get()
  @Roles(...READERS)
  findAll(@Query('all') all?: string) {
    return this.templates.findAll(all === 'true');
  }

  @Post()
  create(@Body() dto: CreateShiftTemplateDto, @CurrentUser() actor: AuthUser) {
    return this.templates.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftTemplateDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.templates.update(id, dto, actor);
  }
}
