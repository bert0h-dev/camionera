import { Module } from '@nestjs/common';
import { PassengerTypesService } from './passenger-types.service.js';
import { TicketsController } from './tickets.controller.js';

@Module({
  controllers: [TicketsController],
  providers: [PassengerTypesService],
  exports: [PassengerTypesService],
})
export class TicketsModule {}
