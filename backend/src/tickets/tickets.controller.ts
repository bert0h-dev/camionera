import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
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
import { SearchDeparturesDto } from '../routes/dto/search.dto.js';
import { AvailabilityService } from './availability.service.js';
import { DeparturesService } from './departures.service.js';
import { HoldDto, SegmentQueryDto, UpdateHoldDto } from './dto/hold.dto.js';
import {
  PayDto,
  QueryOrdersDto,
  SendTicketsDto,
  SetPassengersDto,
} from './dto/sale.dto.js';
import { SaleService } from './sale.service.js';
import { TicketActionsService } from './ticket-actions.service.js';
import {
  CancelQuoteDto,
  CancelTicketsDto,
  CompleteChangeDto,
  LookupDto,
  StartChangeDto,
} from './dto/change.dto.js';
import type { Response } from 'express';

/** Quienes venden o supervisan la venta consultan; las políticas de precio las define el admin. */
export const TICKET_READERS = [
  UserRole.coordinator,
  UserRole.supervisor,
  UserRole.vendor,
];

/** Apartan y venden: taquilla y coordinación (el supervisor solo consulta). */
export const TICKET_SELLERS = [UserRole.coordinator, UserRole.vendor];

@ApiTags('tickets')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly passengerTypes: PassengerTypesService,
    private readonly availability: AvailabilityService,
    private readonly departures: DeparturesService,
    private readonly sale: SaleService,
    private readonly actions: TicketActionsService,
  ) {}

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

  // ---------- Disponibilidad y apartados ----------

  @Get('departures')
  @Roles(...TICKET_READERS)
  departuresSearch(@Query() q: SearchDeparturesDto) {
    return this.departures.departures(q);
  }

  @Get('trips/:tripId/seats')
  @Roles(...TICKET_READERS)
  seats(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Query() q: SegmentQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.seats(tripId, q, user);
  }

  @Post('holds')
  @Roles(...TICKET_SELLERS)
  hold(@Body() dto: HoldDto, @CurrentUser() user: AuthUser) {
    return this.availability.hold(dto, user);
  }

  @Get('orders/:id')
  @Roles(...TICKET_READERS)
  order(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.availability.order(id, user);
  }

  @Patch('holds/:id')
  @Roles(...TICKET_SELLERS)
  updateHold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHoldDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.updateHold(id, dto, user);
  }

  @Delete('holds/:id')
  @Roles(...TICKET_SELLERS)
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.release(id, user);
  }

  // ---------- Venta ----------

  @Get('orders')
  @Roles(...TICKET_READERS)
  orders(@Query() q: QueryOrdersDto, @CurrentUser() user: AuthUser) {
    return this.sale.list(q, user);
  }

  @Put('orders/:id/passengers')
  @Roles(...TICKET_SELLERS)
  passengers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPassengersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sale.setPassengers(id, dto, user);
  }

  @Post('orders/:id/pay')
  @Roles(...TICKET_SELLERS)
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sale.pay(id, dto, user);
  }

  @Get('orders/:id/pdf')
  @Roles(...TICKET_READERS)
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.sale.pdf(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post('orders/:id/send')
  @Roles(...TICKET_READERS)
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTicketsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sale.resend(id, dto.email, user);
  }

  // ---------- Cancelaciones y cambios ----------

  @Get('lookup')
  @Roles(...TICKET_READERS)
  lookup(@Query() q: LookupDto) {
    return this.actions.lookup(q.code);
  }

  @Get('orders/:id/full')
  @Roles(...TICKET_READERS)
  full(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.full(id);
  }

  @Get('trips/:tripId/passengers')
  @Roles(...TICKET_READERS)
  passengersOfTrip(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.actions.passengers(tripId);
  }

  @Post('cancel/quote')
  @Roles(...TICKET_SELLERS)
  cancelQuote(@Body() dto: CancelQuoteDto, @CurrentUser() user: AuthUser) {
    return this.actions.quoteCancel(dto.ticketIds, user);
  }

  @Post('cancel')
  @Roles(...TICKET_SELLERS)
  cancel(@Body() dto: CancelTicketsDto, @CurrentUser() user: AuthUser) {
    return this.actions.cancel(dto, user);
  }

  @Post('changes')
  @Roles(...TICKET_SELLERS)
  startChange(@Body() dto: StartChangeDto, @CurrentUser() user: AuthUser) {
    return this.actions.startChange(dto, user);
  }

  @Get('changes/:orderId')
  @Roles(...TICKET_SELLERS)
  changeView(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actions.changeView(orderId, user);
  }

  @Post('changes/:orderId/complete')
  @Roles(...TICKET_SELLERS)
  completeChange(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CompleteChangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actions.completeChange(orderId, dto, user);
  }
}
