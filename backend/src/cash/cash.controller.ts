import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CashService } from './cash.service.js';
import {
  CashMovementDto,
  CloseCashDto,
  OpenCashDto,
  QueryCashDto,
} from './dto/cash.dto.js';

/** Abren caja quienes cobran; el supervisor consulta todas y puede cortar la de otro. */
const CASHIERS = [UserRole.coordinator, UserRole.vendor];
const CASH_READERS = [...CASHIERS, UserRole.supervisor];

@ApiTags('cash')
@ApiBearerAuth()
@Roles(...CASH_READERS)
@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.cash.current(user);
  }

  @Post('open')
  @Roles(...CASHIERS)
  open(@Body() dto: OpenCashDto, @CurrentUser() user: AuthUser) {
    return this.cash.open(dto, user);
  }

  @Post('movements')
  @Roles(...CASHIERS)
  movement(@Body() dto: CashMovementDto, @CurrentUser() user: AuthUser) {
    return this.cash.movement(dto, user);
  }

  @Get()
  list(@Query() q: QueryCashDto, @CurrentUser() user: AuthUser) {
    return this.cash.list(q, user);
  }

  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.detail(id, user);
  }

  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.close(id, dto, user);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.cash.pdf(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  }
}
