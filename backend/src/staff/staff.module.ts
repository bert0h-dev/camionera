import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AttendanceController,
  MyAttendanceController,
} from './attendance/attendance.controller.js';
import { AttendanceService } from './attendance/attendance.service.js';
import { StaffDocumentsController } from './documents/staff-documents.controller.js';
import { StaffDocumentsService } from './documents/staff-documents.service.js';
import {
  SchedulesController,
  ShiftTemplatesController,
} from './schedules/schedules.controller.js';
import { SchedulesService } from './schedules/schedules.service.js';
import { ShiftTemplatesService } from './schedules/shift-templates.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [AuthModule],
  // StaffDocumentsController primero: sus rutas estáticas (/staff/expirations) deben ganar a /staff/:id
  controllers: [
    StaffDocumentsController,
    StaffController,
    SchedulesController,
    ShiftTemplatesController,
    MyAttendanceController,
    AttendanceController,
  ],
  providers: [
    StaffService,
    StaffDocumentsService,
    SchedulesService,
    ShiftTemplatesService,
    AttendanceService,
  ],
  exports: [StaffDocumentsService, SchedulesService, AttendanceService],
})
export class StaffModule {}
