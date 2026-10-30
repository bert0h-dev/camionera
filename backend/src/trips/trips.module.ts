import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TripsController } from './trips.controller.js';
import { TripAssignmentService } from './trip-assignment.service.js';
import { TripStatusService } from './trip-status.service.js';
import { TripsService } from './trips.service.js';

// No importa RoutesModule: Rutas avisa a Recorridos al cambiar horarios, no al revés
@Module({
  imports: [SettingsModule, FleetModule],
  controllers: [TripsController],
  providers: [TripsService, TripAssignmentService, TripStatusService],
  exports: [TripsService, TripAssignmentService, TripStatusService],
})
export class TripsModule {}
