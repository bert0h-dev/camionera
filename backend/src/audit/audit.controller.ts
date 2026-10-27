import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { AuditViewerService } from './audit-viewer.service.js';
import {
  AuditLogQueryDto,
  SecurityEventQueryDto,
} from './dto/audit-query.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('audit')
export class AuditController {
  constructor(private readonly viewer: AuditViewerService) {}

  @Get('summary')
  summary() {
    return this.viewer.summary();
  }

  @Get('filters')
  filters() {
    return this.viewer.filters();
  }

  @Get('logs')
  logs(@Query() query: AuditLogQueryDto) {
    return this.viewer.logs(query);
  }

  @Get('logs/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="bitacora.csv"')
  exportLogs(@Query() query: AuditLogQueryDto) {
    return this.viewer.exportLogs(query);
  }

  @Get('security-events')
  securityEvents(@Query() query: SecurityEventQueryDto) {
    return this.viewer.securityEvents(query);
  }
}
