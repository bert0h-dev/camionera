import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { BusModelsService } from './bus-models.service.js';
import { BusesController } from './buses.controller.js';
import { BusesService } from './buses.service.js';
import { CatalogsService } from './catalogs.service.js';
import {
  BusModelsController,
  FleetCatalogsController,
} from './fleet.controller.js';

@Module({
  imports: [SettingsModule],
  controllers: [FleetCatalogsController, BusModelsController, BusesController],
  providers: [CatalogsService, BusModelsService, BusesService],
  exports: [CatalogsService, BusModelsService, BusesService],
})
export class FleetModule {}
