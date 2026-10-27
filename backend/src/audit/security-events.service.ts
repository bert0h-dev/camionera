import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { SecurityEventType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SecurityEventInput {
  type: SecurityEventType;
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

/** Registra eventos de acceso. Un fallo al registrar nunca debe impedir la operación. */
@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(event: SecurityEventInput) {
    try {
      await this.prisma.securityEvent.create({
        data: {
          ...event,
          email: event.email?.toLowerCase(),
          details: event.details as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo registrar el evento ${event.type}: ${(err as Error).message}`,
      );
    }
  }
}
