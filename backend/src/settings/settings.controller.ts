import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';
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

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.settings.set(key, dto.value, actor.id);
  }
}
