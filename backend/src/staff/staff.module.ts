import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StaffDocumentsController } from './documents/staff-documents.controller.js';
import { StaffDocumentsService } from './documents/staff-documents.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [AuthModule],
  // StaffDocumentsController primero: sus rutas estáticas (/staff/expirations) deben ganar a /staff/:id
  controllers: [StaffDocumentsController, StaffController],
  providers: [StaffService, StaffDocumentsService],
  exports: [StaffDocumentsService],
})
export class StaffModule {}
