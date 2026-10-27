import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    // El hash de la contraseña nunca sale en las consultas salvo que se pida explícitamente
    super({ adapter, omit: { user: { passwordHash: true } } });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
