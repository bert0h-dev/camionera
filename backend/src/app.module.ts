import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FleetModule } from './fleet/fleet.module.js';
import { MailModule } from './mail/mail.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StaffModule } from './staff/staff.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    StaffModule,
    DashboardModule,
    PayrollModule,
    FleetModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
