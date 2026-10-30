import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';
import { SchedulesService } from './schedules.service.js';
import { SearchService } from './search.service.js';
import { SeasonsController } from './seasons.controller.js';
import { SeasonsService } from './seasons.service.js';

@Module({
  imports: [FleetModule, SettingsModule, TripsModule],
  controllers: [RoutesController, SeasonsController],
  providers: [RoutesService, SchedulesService, SeasonsService, SearchService],
  exports: [RoutesService, SchedulesService, SeasonsService],
})
export class RoutesModule {}
