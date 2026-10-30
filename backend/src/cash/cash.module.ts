import { Module } from '@nestjs/common';
import { CashController } from './cash.controller.js';
import { CashService } from './cash.service.js';

// Boletos y Pendientes lo importan; la caja no depende de ellos
@Module({
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
