import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDefined, IsObject } from 'class-validator';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { SettingsService } from './settings.service.js';

class UpdateSettingDto {
  @ApiProperty({ example: 30 })
  @IsDefined()
  value: unknown;
}

class UpdateManySettingsDto {
  @ApiProperty({
    example: {
      'taxes.vat_rate': 16,
      'company.trade_name': 'Central Camionera',
    },
  })
  @IsObject()
  values: Record<string, unknown>;
}

@ApiTags('settings')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  findAll() {
    return this.settings.findAll();
  }

  /** Datos de la empresa, impuestos y comisiones: los necesita cualquier pantalla que imprima o cobre. */
  @Get('company')
  @Roles(
    UserRole.hr,
    UserRole.supervisor,
    UserRole.coordinator,
    UserRole.driver,
    UserRole.collector,
    UserRole.vendor,
    UserRole.viewer,
  )
  company() {
    return this.settings.publicValues();
  }

  /** Guarda una sección completa; si un valor es inválido no se guarda nada. */
  @Patch()
  updateMany(
    @Body() dto: UpdateManySettingsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.settings.setMany(dto.values, actor.id);
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.settings.set(key, dto.value, actor.id);
  }
}
