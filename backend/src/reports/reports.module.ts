import { ExecutiveReportService } from './executive-report.service.js';
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { CancellationReportService } from './cancellation-report.service.js';
import { FleetReportService } from './fleet-report.service.js';
import { StaffReportService } from './staff-report.service.js';
import { OccupancyReportService } from './occupancy-report.service.js';
import { SalesReportService } from './sales-report.service.js';

/** Reportes y analytics (Módulo 7): solo lectura sobre los datos de los módulos 1–6. */
@Module({
  controllers: [ReportsController],
  providers: [
    SalesReportService,
    OccupancyReportService,
    CancellationReportService,
    FleetReportService,
    StaffReportService,
    ExecutiveReportService,
  ],
})
export class ReportsModule {}
