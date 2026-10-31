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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import {
  AssignTripDto,
  ChangeTripStatusDto,
  MineQueryDto,
  CreateExtraTripDto,
  DeparturesBoardQueryDto,
  SetTripPlatformDto,
  GenerateTripsDto,
  QueryTripsDto,
  SummaryQueryDto,
} from './dto/trip.dto.js';
import { TripAssignmentService } from './trip-assignment.service.js';
import { TripPlatformService } from './trip-platform.service.js';
import { TripStatusService } from './trip-status.service.js';
import { TripsService } from './trips.service.js';

/** Coordinación (y admin) gestiona los recorridos; supervisión y taquilla los consultan. */
export const TRIP_READERS = [
  UserRole.coordinator,
  UserRole.supervisor,
  UserRole.vendor,
];
export const TRIP_EDITORS = [UserRole.coordinator];

@ApiTags('trips')
@ApiBearerAuth()
@Roles(...TRIP_EDITORS)
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly assignment: TripAssignmentService,
    private readonly status: TripStatusService,
    private readonly platforms: TripPlatformService,
  ) {}

  @Get('summary')
  @Roles(...TRIP_READERS)
  summary(@Query() q: SummaryQueryDto) {
    return this.trips.summary(q.date);
  }

  @Get('route-options')
  @Roles(...TRIP_READERS)
  routeOptions() {
    return this.trips.routeOptions();
  }

  /** Tablero de salidas: lo consulta toda la operación (taquilla, cobradores, conductores). */
  @Get('departures-board')
  @Roles(...TRIP_READERS, UserRole.collector, UserRole.driver)
  departuresBoard(@Query() q: DeparturesBoardQueryDto) {
    return this.platforms.board(q.terminalId);
  }

  // Antes de :id para que /trips/mine no se lea como un id
  @Get('mine')
  @Roles(UserRole.driver, UserRole.collector)
  mine(@Query() q: MineQueryDto, @CurrentUser() actor: AuthUser) {
    return this.status.mine(actor, q);
  }

  @Get()
  @Roles(...TRIP_READERS)
  findAll(@Query() q: QueryTripsDto) {
    return this.trips.findAll(q);
  }

  @Post('generate')
  generate(@Body() dto: GenerateTripsDto, @CurrentUser() actor: AuthUser) {
    return this.trips.generateRange(dto, actor);
  }

  @Post('extra')
  createExtra(@Body() dto: CreateExtraTripDto, @CurrentUser() actor: AuthUser) {
    return this.trips.createExtra(dto, actor);
  }

  @Get(':id')
  @Roles(...TRIP_READERS, UserRole.driver, UserRole.collector)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.status.assertCanView(id, actor);
    return this.trips.findOne(id);
  }

  /** El conductor opera sus propios recorridos (sin cancelar); lo valida el servicio. */
  @Patch(':id/status')
  @Roles(...TRIP_EDITORS, UserRole.driver)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTripStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.status.change(id, dto, actor);
  }

  @Get(':id/candidates')
  candidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignment.candidates(id);
  }

  @Put(':id/assignment')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTripDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.assignment.assign(id, dto, actor);
  }

  @Get(':id/platforms')
  platformOptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.platforms.options(id);
  }

  @Patch(':id/platform')
  setPlatform(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTripPlatformDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.platforms.set(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  removeExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.trips.removeExtra(id, actor);
  }
}
