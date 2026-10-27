import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [StaffModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
