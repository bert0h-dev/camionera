import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseImageDataUrl } from './file-rules.js';

const LOGO = 'company_logo';

/** Archivos pequeños en la base. Por ahora solo el logo de la empresa (uno a la vez). */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  logo() {
    return this.prisma.storedFile.findFirst({
      where: { purpose: LOGO },
      orderBy: { createdAt: 'desc' },
    });
  }

  async logoInfo() {
    const f = await this.prisma.storedFile.findFirst({
      where: { purpose: LOGO },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        contentType: true,
        size: true,
        createdAt: true,
      },
    });
    return f;
  }

  async setLogo(fileName: string, dataUrl: string, actor: AuthUser) {
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed.ok) throw new BadRequestException(parsed.error);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.storedFile.deleteMany({ where: { purpose: LOGO } });
      return tx.storedFile.create({
        data: {
          purpose: LOGO,
          fileName,
          contentType: parsed.contentType,
          size: parsed.data.length,
          data: new Uint8Array(parsed.data),
          createdById: actor.id,
        },
        select: {
          id: true,
          fileName: true,
          contentType: true,
          size: true,
          createdAt: true,
        },
      });
    });
    await this.audit.log({
      userId: actor.id,
      tableName: 'stored_files',
      recordId: row.id,
      actionType: ActionType.insert,
      oldValues: null,
      newValues: row,
    });
    return row;
  }

  async removeLogo(actor: AuthUser) {
    const before = await this.logoInfo();
    if (!before) return;
    await this.prisma.storedFile.deleteMany({ where: { purpose: LOGO } });
    await this.audit.log({
      userId: actor.id,
      tableName: 'stored_files',
      recordId: before.id,
      actionType: ActionType.delete,
      oldValues: before,
      newValues: {},
    });
  }
}
