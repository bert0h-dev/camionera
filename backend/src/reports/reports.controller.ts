import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  OccupancyReportDto,
  ReportRangeDto,
  SalesReportDto,
} from './dto/report.dto.js';
import { fleetDocument, staffDocument } from './fleet-staff-document.js';
import { FleetReportService } from './fleet-report.service.js';
import { StaffReportService } from './staff-report.service.js';
import { cancellationDocument } from './cancellation-document.js';
import { CancellationReportService } from './cancellation-report.service.js';
import { occupancyDocument } from './occupancy-document.js';
import { OccupancyReportService } from './occupancy-report.service.js';
import { reportPdf, reportXlsx, type ReportDocument } from './report-export.js';
import { salesDocument } from './sales-document.js';
import { SalesReportService } from './sales-report.service.js';

/** Ventas: supervisión y coordinación ven todo; el vendedor, solo lo suyo (lo filtra el servicio). */
const SALES_READERS = [
  UserRole.supervisor,
  UserRole.coordinator,
  UserRole.vendor,
];
/** Operación (ocupación): supervisión y coordinación. */
const OPERATION_READERS = [UserRole.supervisor, UserRole.coordinator];
/** Personal: además RRHH. */
const STAFF_READERS = [UserRole.supervisor, UserRole.coordinator, UserRole.hr];

@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly sales: SalesReportService,
    private readonly occupancyReport: OccupancyReportService,
    private readonly cancellationReport: CancellationReportService,
    private readonly fleetReport: FleetReportService,
    private readonly staffReport: StaffReportService,
    private readonly settings: SettingsService,
  ) {}

  private async company() {
    return String(
      (await this.settings.get('company.trade_name')) || 'Central Camionera',
    );
  }

  /** Manda el documento como Excel (por defecto) o PDF. */
  private async send(
    res: Response,
    doc: ReportDocument,
    name: string,
    format?: string,
  ) {
    const pdf = format === 'pdf';
    res.setHeader(
      'Content-Type',
      pdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${name}.${pdf ? 'pdf' : 'xlsx'}"`,
    );
    res.send(pdf ? await reportPdf(doc) : await reportXlsx(doc));
  }

  @Get('sales')
  @Roles(...SALES_READERS)
  salesReport(@Query() q: SalesReportDto, @CurrentUser() user: AuthUser) {
    return this.sales.sales(q, user);
  }

  @Get('sales/export')
  @Roles(...SALES_READERS)
  async salesExport(
    @Query() q: SalesReportDto & { format?: string },
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const data = await this.sales.sales(q, user);
    await this.send(
      res,
      salesDocument(data, await this.company()),
      `ventas-${data.range.from}-a-${data.range.to}`,
      q.format,
    );
  }

  @Get('occupancy')
  @Roles(...OPERATION_READERS)
  occupancy(@Query() q: OccupancyReportDto) {
    return this.occupancyReport.occupancy(q);
  }

  @Get('occupancy/export')
  @Roles(...OPERATION_READERS)
  async occupancyExport(
    @Query() q: OccupancyReportDto & { format?: string },
    @Res() res: Response,
  ) {
    const data = await this.occupancyReport.occupancy(q);
    await this.send(
      res,
      occupancyDocument(data, await this.company()),
      `ocupacion-${data.range.from}-a-${data.range.to}`,
      q.format,
    );
  }

  @Get('cancellations')
  @Roles(...OPERATION_READERS)
  cancellations(@Query() q: OccupancyReportDto) {
    return this.cancellationReport.cancellations(q);
  }

  @Get('cancellations/export')
  @Roles(...OPERATION_READERS)
  async cancellationsExport(
    @Query() q: OccupancyReportDto & { format?: string },
    @Res() res: Response,
  ) {
    const data = await this.cancellationReport.cancellations(q);
    await this.send(
      res,
      cancellationDocument(data, await this.company()),
      `cancelaciones-${data.range.from}-a-${data.range.to}`,
      q.format,
    );
  }

  @Get('fleet')
  @Roles(...OPERATION_READERS)
  fleet(@Query() q: ReportRangeDto) {
    return this.fleetReport.fleet(q);
  }

  @Get('fleet/export')
  @Roles(...OPERATION_READERS)
  async fleetExport(
    @Query() q: ReportRangeDto & { format?: string },
    @Res() res: Response,
  ) {
    const data = await this.fleetReport.fleet(q);
    await this.send(
      res,
      fleetDocument(data, await this.company()),
      `flota-${data.range.from}-a-${data.range.to}`,
      q.format,
    );
  }

  @Get('staff')
  @Roles(...STAFF_READERS)
  staff(@Query() q: ReportRangeDto) {
    return this.staffReport.staff(q);
  }

  @Get('staff/export')
  @Roles(...STAFF_READERS)
  async staffExport(
    @Query() q: ReportRangeDto & { format?: string },
    @Res() res: Response,
  ) {
    const data = await this.staffReport.staff(q);
    await this.send(
      res,
      staffDocument(data, await this.company()),
      `personal-${data.range.from}-a-${data.range.to}`,
      q.format,
    );
  }
}
