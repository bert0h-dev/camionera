import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  CreateExtraTripDto,
  GenerateTripsDto,
  QueryTripsDto,
  SummaryQueryDto,
} from './dto/trip.dto.js';
import { TripAssignmentService } from './trip-assignment.service.js';
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
  @Roles(...TRIP_READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.findOne(id);
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

  @Delete(':id')
  @HttpCode(204)
  removeExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.trips.removeExtra(id, actor);
  }
}
