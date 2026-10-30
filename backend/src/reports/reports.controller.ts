import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { SettingsService } from '../settings/settings.service.js';
import { OccupancyReportDto, SalesReportDto } from './dto/report.dto.js';
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

@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly sales: SalesReportService,
    private readonly occupancyReport: OccupancyReportService,
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
}
