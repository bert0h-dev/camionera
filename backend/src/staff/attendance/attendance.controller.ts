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
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../generated/prisma/enums.js';
import { AttendanceService } from './attendance.service.js';
import {
  AttendanceDayDto,
  CreateAttendanceDto,
  QueryAttendanceDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto.js';

const READERS = [UserRole.hr, UserRole.supervisor, UserRole.coordinator];
const RECORDERS = [UserRole.hr, UserRole.supervisor];

class CloseDayDto {
  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  date: string;
}

/** Autoregistro: cualquier usuario ligado a un empleado. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance/me')
export class MyAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.myToday(user);
  }

  @Post('check-in')
  checkIn(@CurrentUser() user: AuthUser) {
    return this.attendance.selfCheckIn(user);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: AuthUser) {
    return this.attendance.selfCheckOut(user);
  }
}

@ApiTags('attendance')
@ApiBearerAuth()
@Roles(...RECORDERS)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @Roles(...READERS)
  findAll(@Query() query: QueryAttendanceDto) {
    return this.attendance.findAll(query);
  }

  @Get('day')
  @Roles(...READERS)
  day(@Query() query: AttendanceDayDto) {
    return this.attendance.day(query);
  }

  @Get('summary')
  @Roles(UserRole.hr)
  summary(@Query() query: QueryAttendanceDto) {
    return this.attendance.summary(query);
  }

  @Post()
  create(@Body() dto: CreateAttendanceDto, @CurrentUser() actor: AuthUser) {
    return this.attendance.create(dto, actor);
  }

  @Post('close-day')
  @Roles(UserRole.hr)
  closeDay(@Body() dto: CloseDayDto, @CurrentUser() actor: AuthUser) {
    return this.attendance.closeDay(dto.date, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.attendance.update(id, dto, actor);
  }
}
