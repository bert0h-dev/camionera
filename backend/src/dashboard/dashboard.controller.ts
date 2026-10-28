import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { HomePreferencesDto } from './dto/home-preferences.dto.js';
import { PendingService } from './pending.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly pending: PendingService,
  ) {}

  /** Cualquier usuario: `team` solo para lectores de personal, `me` si está ligado a un empleado. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }

  /** Pendientes de todas las áreas que el rol puede ver, del más urgente al menos. */
  @Get('pending')
  pendingList(@CurrentUser() user: AuthUser) {
    return this.pending.list(user);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.dashboard.homePreferences(user.id);
  }

  @Put('preferences')
  savePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: HomePreferencesDto,
  ) {
    return this.dashboard.saveHomePreferences(user.id, dto);
  }
}
