import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

// No importa RoutesModule: Rutas avisa a Recorridos al cambiar horarios, no al revés
@Module({
  imports: [SettingsModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
