import { Module } from '@nestjs/common';
import { BusModelsService } from './bus-models.service.js';
import { CatalogsService } from './catalogs.service.js';
import {
  BusModelsController,
  FleetCatalogsController,
} from './fleet.controller.js';

@Module({
  controllers: [FleetCatalogsController, BusModelsController],
  providers: [CatalogsService, BusModelsService],
  exports: [CatalogsService, BusModelsService],
})
export class FleetModule {}
