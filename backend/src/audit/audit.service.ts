import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActionType, Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  userId?: string;
  tableName: string;
  recordId: string;
  actionType: ActionType;
  oldValues?: object | null;
  newValues?: object | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    await this.prisma.auditLog.create({
      data: {
        ...entry,
        oldValues: (entry.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
        newValues: (entry.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
