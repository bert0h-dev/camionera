import { Module } from '@nestjs/common';
import {
  CompensationController,
  MyPayrollController,
  PayrollController,
} from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';

@Module({
  controllers: [CompensationController, MyPayrollController, PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
