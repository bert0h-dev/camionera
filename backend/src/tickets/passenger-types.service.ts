import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PassengerTypeDto,
  UpdatePassengerTypeDto,
} from './dto/passenger-type.dto.js';

/** Tipos de pasajero con su descuento. No se borran (los boletos los referencian), se desactivan. */
@Injectable()
export class PassengerTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive = false) {
    return this.prisma.passengerType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { _count: { select: { tickets: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: PassengerTypeDto, actor: AuthUser) {
    const row = await this.prisma.$transaction(async (tx) => {
      const last = await tx.passengerType.aggregate({
        _max: { sortOrder: true },
      });
      if (dto.isDefault)
        await tx.passengerType.updateMany({ data: { isDefault: false } });
      return tx.passengerType.create({
        data: {
          ...dto,
          sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
        },
      });
    });
    await this.log(actor, row.id, ActionType.insert, null, row);
    return row;
  }

  async update(id: string, dto: UpdatePassengerTypeDto, actor: AuthUser) {
    const before = await this.prisma.passengerType.findUniqueOrThrow({
      where: { id },
    });
    const isDefault = dto.isDefault ?? before.isDefault;
    const isActive = dto.isActive ?? before.isActive;
    if (isDefault && !isActive)
      throw new BadRequestException(
        'El tipo predeterminado no se puede desactivar; marca otro como predeterminado primero',
      );
    if (before.isDefault && dto.isDefault === false)
      throw new BadRequestException(
        'Siempre debe haber un tipo predeterminado; marca otro en su lugar',
      );
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault && !before.isDefault)
        await tx.passengerType.updateMany({
          where: { id: { not: id } },
          data: { isDefault: false },
        });
      return tx.passengerType.update({ where: { id }, data: dto });
    });
    await this.log(actor, id, ActionType.update, before, row);
    return row;
  }

  private log(
    actor: AuthUser,
    recordId: string,
    actionType: ActionType,
    before: object | null,
    after: object,
  ) {
    return this.audit.log({
      userId: actor.id,
      tableName: 'passenger_types',
      recordId,
      actionType,
      oldValues: before,
      newValues: after,
    });
  }
}
