import { Global, Module } from '@nestjs/common';
import { AuditViewerService } from './audit-viewer.service.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { SecurityEventsService } from './security-events.service.js';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, SecurityEventsService, AuditViewerService],
  exports: [AuditService, SecurityEventsService],
})
export class AuditModule {}
