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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CatalogQueryDto } from '../fleet/dto/fleet.dto.js';
import { UserRole } from '../generated/prisma/enums.js';
import {
  PassengerTypeDto,
  UpdatePassengerTypeDto,
} from './dto/passenger-type.dto.js';
import { PassengerTypesService } from './passenger-types.service.js';

/** Quienes venden o supervisan la venta consultan; las políticas de precio las define el admin. */
export const TICKET_READERS = [
  UserRole.coordinator,
  UserRole.supervisor,
  UserRole.vendor,
];

@ApiTags('tickets')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly passengerTypes: PassengerTypesService) {}

  @Get('passenger-types')
  @Roles(...TICKET_READERS)
  listPassengerTypes(@Query() q: CatalogQueryDto) {
    return this.passengerTypes.list(q.includeInactive);
  }

  @Post('passenger-types')
  createPassengerType(
    @Body() dto: PassengerTypeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.passengerTypes.create(dto, actor);
  }

  @Patch('passenger-types/:id')
  updatePassengerType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePassengerTypeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.passengerTypes.update(id, dto, actor);
  }
}
