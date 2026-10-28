import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { BusModelsService } from './bus-models.service.js';
import { BusesController } from './buses.controller.js';
import { BusesService } from './buses.service.js';
import { FuelController } from './fuel.controller.js';
import { FuelService } from './fuel.service.js';
import { IncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { MaintenanceService } from './maintenance.service.js';
import { CatalogsService } from './catalogs.service.js';
import {
  BusModelsController,
  FleetCatalogsController,
} from './fleet.controller.js';

@Module({
  imports: [SettingsModule],
  controllers: [
    FleetCatalogsController,
    BusModelsController,
    BusesController,
    MaintenanceController,
    IncidentsController,
    FuelController,
  ],
  providers: [
    CatalogsService,
    BusModelsService,
    BusesService,
    MaintenanceService,
    IncidentsService,
    FuelService,
  ],
  exports: [
    CatalogsService,
    BusModelsService,
    BusesService,
    MaintenanceService,
    IncidentsService,
    FuelService,
  ],
})
export class FleetModule {}
