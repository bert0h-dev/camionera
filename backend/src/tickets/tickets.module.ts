import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module.js';
import { RoutesModule } from '../routes/routes.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AvailabilityService } from './availability.service.js';
import { DeparturesService } from './departures.service.js';
import { PassengerTypesService } from './passenger-types.service.js';
import { SaleService } from './sale.service.js';
import { TicketActionsService } from './ticket-actions.service.js';
import { BoardingService } from './boarding.service.js';
import { PromotionsService } from './promotions.service.js';
import { CustomersService } from './customers.service.js';
import { CustomersController } from './customers.controller.js';
import { TripsModule } from '../trips/trips.module.js';
import { TicketsController } from './tickets.controller.js';

// Importa RoutesModule por la búsqueda de salidas; Rutas y Recorridos no dependen de Boletos
@Module({
  imports: [SettingsModule, RoutesModule, TripsModule, CashModule],
  controllers: [TicketsController, CustomersController],
  providers: [
    PassengerTypesService,
    AvailabilityService,
    DeparturesService,
    SaleService,
    TicketActionsService,
    BoardingService,
    PromotionsService,
    CustomersService,
  ],
  exports: [PassengerTypesService, AvailabilityService, TicketActionsService],
})
export class TicketsModule {}
