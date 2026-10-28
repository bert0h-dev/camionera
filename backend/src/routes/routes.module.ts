import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  imports: [FleetModule, SettingsModule],
  controllers: [RoutesController],
  providers: [RoutesService, SchedulesService],
  exports: [RoutesService, SchedulesService],
})
export class RoutesModule {}
