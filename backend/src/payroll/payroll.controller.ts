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
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import {
  CreateAdjustmentDto,
  CreateCompensationDto,
  CreatePeriodDto,
  ExportQueryDto,
  PayrollSettingsDto,
  QueryPeriodsDto,
} from './dto/payroll.dto.js';
import { PayrollService } from './payroll.service.js';

/** Salarios en la ficha del empleado: solo RRHH (y admin). */
@ApiTags('payroll')
@ApiBearerAuth()
@Roles(UserRole.hr)
@Controller('staff')
export class CompensationController {
  constructor(private readonly payroll: PayrollService) {}

  @Get(':id/compensation')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.compensations(id);
  }

  @Post(':id/compensation')
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompensationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.addCompensation(id, dto, actor);
  }
}

/** Recibos del propio empleado. */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll/me')
export class MyPayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.payroll.mine(user);
  }
}

@ApiTags('payroll')
@ApiBearerAuth()
@Roles(UserRole.hr)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('settings')
  settings() {
    return this.payroll.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body() dto: PayrollSettingsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.updateSettings(dto, actor);
  }

  @Get('periods')
  periods(@Query() query: QueryPeriodsDto) {
    return this.payroll.findPeriods(query);
  }

  @Post('periods')
  createPeriod(@Body() dto: CreatePeriodDto, @CurrentUser() actor: AuthUser) {
    return this.payroll.createPeriod(dto, actor);
  }

  @Get('periods/:id')
  period(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.findPeriod(id);
  }

  @Post('periods/:id/generate')
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.generate(id, actor);
  }

  @Post('periods/:id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.close(id, actor);
  }

  @Post('periods/:id/pay')
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.payroll.markPaid(id, actor);
  }

  @Delete('periods/:id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.removePeriod(id, actor);
  }

  @Get('periods/:id/export')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportQueryDto,
  ) {
    const file = await this.payroll.export(id, query.format);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Post('entries/:id/adjustments')
  addAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.addAdjustment(id, dto, actor);
  }

  @Delete('adjustments/:id')
  @HttpCode(204)
  removeAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.removeAdjustment(id, actor);
  }
}
