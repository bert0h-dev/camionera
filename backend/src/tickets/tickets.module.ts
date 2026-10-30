import { Module } from '@nestjs/common';
import { RoutesModule } from '../routes/routes.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AvailabilityService } from './availability.service.js';
import { DeparturesService } from './departures.service.js';
import { PassengerTypesService } from './passenger-types.service.js';
import { TicketsController } from './tickets.controller.js';

// Importa RoutesModule por la búsqueda de salidas; Rutas y Recorridos no dependen de Boletos
@Module({
  imports: [SettingsModule, RoutesModule],
  controllers: [TicketsController],
  providers: [PassengerTypesService, AvailabilityService, DeparturesService],
  exports: [PassengerTypesService, AvailabilityService],
})
export class TicketsModule {}
