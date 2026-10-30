import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module.js';
import { FleetModule } from '../fleet/fleet.module.js';
import { RoutesModule } from '../routes/routes.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { PendingService } from './pending.service.js';

@Module({
  imports: [StaffModule, FleetModule, RoutesModule, TripsModule, CashModule],
  controllers: [DashboardController],
  providers: [DashboardService, PendingService],
})
export class DashboardModule {}
