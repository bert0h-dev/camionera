import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { ActionType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateShiftTemplateDto,
  UpdateShiftTemplateDto,
} from './dto/shift-template.dto.js';

const TABLE = 'shift_templates';

@Injectable()
export class ShiftTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(includeInactive = false) {
    return this.prisma.shiftTemplate.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { startTime: 'asc' },
    });
  }

  async create(dto: CreateShiftTemplateDto, actor: AuthUser) {
    const template = await this.prisma.shiftTemplate.create({ data: dto });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: template.id,
      actionType: ActionType.insert,
      newValues: template,
    });
    return template;
  }

  async update(id: string, dto: UpdateShiftTemplateDto, actor: AuthUser) {
    const before = await this.prisma.shiftTemplate.findUniqueOrThrow({
      where: { id },
    });
    const template = await this.prisma.shiftTemplate.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: template,
    });
    return template;
  }
}
