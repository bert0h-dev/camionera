import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { SettingsService } from '../settings/settings.service.js';
import { SalesReportDto } from './dto/report.dto.js';
import { reportPdf, reportXlsx } from './report-export.js';
import { salesDocument } from './sales-document.js';
import { SalesReportService } from './sales-report.service.js';

/** Ventas: supervisión y coordinación ven todo; el vendedor, solo lo suyo (lo filtra el servicio). */
const SALES_READERS = [
  UserRole.supervisor,
  UserRole.coordinator,
  UserRole.vendor,
];

@ApiTags('reports')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly sales: SalesReportService,
    private readonly settings: SettingsService,
  ) {}

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
    const company = String(
      (await this.settings.get('company.trade_name')) || 'Central Camionera',
    );
    const doc = salesDocument(data, company);
    const name = `ventas-${data.range.from}-a-${data.range.to}`;
    if (q.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${name}.pdf"`,
      );
      res.send(await reportPdf(doc));
      return;
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    res.send(await reportXlsx(doc));
  }
}
