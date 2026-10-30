import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { OccupancyReportService } from './occupancy-report.service.js';
import { SalesReportService } from './sales-report.service.js';

/** Reportes y analytics (Módulo 7): solo lectura sobre los datos de los módulos 1–6. */
@Module({
  controllers: [ReportsController],
  providers: [SalesReportService, OccupancyReportService],
})
export class ReportsModule {}
