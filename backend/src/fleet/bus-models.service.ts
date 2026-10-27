import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType, BusType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateBusModelDto,
  QueryBusModelsDto,
  UpdateBusModelDto,
} from './dto/fleet.dto.js';
import {
  defaultLayout,
  seatCount,
  validateLayout,
  type BusLayout,
} from './layout-rules.js';

const TABLE = 'bus_models';
const include = {
  fuelType: { select: { id: true, name: true, unit: true } },
} satisfies Prisma.BusModelInclude;

/** Valida el layout para el tipo de autobús y devuelve la capacidad que resulta. */
function checkLayout(layout: unknown, busType: BusType) {
  const errors = validateLayout(
    layout,
    busType === BusType.double_decker ? 2 : 1,
  );
  if (errors.length) throw new BadRequestException(errors);
  return seatCount(layout as BusLayout);
}

@Injectable()
export class BusModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  defaultLayout(rows: number, floors: number) {
    return defaultLayout(rows, floors === 2 ? 2 : 1);
  }

  async findAll(q: QueryBusModelsDto) {
    const terms = q.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.BusModelWhereInput = {
      busType: q.busType,
      isActive: q.includeInactive ? undefined : true,
      AND: terms.map((t) => ({
        OR: [
          { brand: { contains: t, mode: 'insensitive' } },
          { model: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    const [data, total] = await Promise.all([
      this.prisma.busModel.findMany({
        where,
        include,
        orderBy: [{ brand: 'asc' }, { model: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.busModel.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  findOne(id: string) {
    return this.prisma.busModel.findUniqueOrThrow({ where: { id }, include });
  }

  async create(dto: CreateBusModelDto, actor: AuthUser) {
    const seats = checkLayout(dto.layout, dto.busType);
    const row = await this.prisma.busModel.create({
      data: {
        ...dto,
        layout: dto.layout as Prisma.InputJsonValue,
        seatCount: seats,
      },
      include,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: row.id,
      actionType: ActionType.insert,
      newValues: { ...row, layout: undefined },
    });
    return row;
  }

  async update(id: string, dto: UpdateBusModelDto, actor: AuthUser) {
    const before = await this.prisma.busModel.findUniqueOrThrow({
      where: { id },
    });
    const { layout, ...rest } = dto;
    // Si cambia el tipo o el layout se revalida la combinación resultante
    let seats: number | undefined;
    if (layout || dto.busType)
      seats = checkLayout(
        layout ?? before.layout,
        dto.busType ?? before.busType,
      );

    const row = await this.prisma.busModel.update({
      where: { id },
      data: {
        ...rest,
        ...(layout && { layout: layout as Prisma.InputJsonValue }),
        ...(seats !== undefined && { seatCount: seats }),
      },
      include,
    });
    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: { ...before, layout: layout ? before.layout : undefined },
      newValues: {
        ...rest,
        ...(layout && { layout }),
        seatCount: row.seatCount,
      },
    });
    return row;
  }
}
