import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType, StaffStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { GrantAccessDto } from './dto/grant-access.dto.js';
import { QueryStaffDto } from './dto/query-staff.dto.js';
import { TerminateStaffDto } from './dto/terminate-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { resolveUserRole } from './staff-roles.js';

const TABLE = 'staff';
const MIN_AGE = 18;

const include = {
  user: { select: { id: true, email: true, role: true, isActive: true, lastLogin: true } },
} satisfies Prisma.StaffInclude;

/** Fecha 'AAAA-MM-DD' a Date en UTC (columnas @db.Date). */
const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

export const fullNameOf = (s: { firstName: string; lastName: string; secondLastName?: string | null }) =>
  [s.firstName, s.lastName, s.secondLastName].filter(Boolean).join(' ');

function assertAdult(birthDate: Date, hireDate: Date) {
  const adultAt = new Date(birthDate);
  adultAt.setUTCFullYear(adultAt.getUTCFullYear() + MIN_AGE);
  if (adultAt > hireDate) {
    throw new BadRequestException(`El empleado debe tener al menos ${MIN_AGE} años a la fecha de contratación`);
  }
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async findAll(query: QueryStaffDto) {
    // Cada palabra debe coincidir con algún campo: "juan perez" encuentra a Juan Pérez
    const terms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.StaffWhereInput = {
      role: query.role,
      status: query.status,
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { secondLastName: { contains: term, mode: 'insensitive' } },
          { employeeNumber: { contains: term, mode: 'insensitive' } },
          { curp: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
        ],
      })),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.staff.findMany({
        where,
        include,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.staff.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  findOne(id: string) {
    return this.prisma.staff.findUniqueOrThrow({ where: { id }, include });
  }

  async create(dto: CreateStaffDto, actor: AuthUser) {
    const { birthDate: birth, hireDate: hire, ...data } = dto;
    const birthDate = toDate(birth);
    const hireDate = toDate(hire);
    assertAdult(birthDate, hireDate);

    const staff = await this.prisma.$transaction(async (tx) => {
      const [{ seq }] = await tx.$queryRaw<{ seq: bigint }[]>`
        SELECT nextval('staff_employee_number_seq') AS seq`;
      return tx.staff.create({
        data: {
          ...data,
          birthDate,
          hireDate,
          employeeNumber: `EMP-${seq.toString().padStart(6, '0')}`,
        },
        include,
      });
    });

    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: staff.id,
      actionType: ActionType.insert,
      newValues: staff,
    });
    return staff;
  }

  async update(id: string, dto: UpdateStaffDto, actor: AuthUser) {
    const before = await this.findOne(id);
    if (before.status === StaffStatus.inactive) {
      throw new BadRequestException('No se puede editar a un empleado dado de baja');
    }

    const { birthDate: birth, hireDate: hire, ...data } = dto;
    const birthDate = birth ? toDate(birth) : before.birthDate;
    const hireDate = hire ? toDate(hire) : before.hireDate;
    assertAdult(birthDate, hireDate);

    const staff = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id },
        data: { ...data, birthDate, hireDate },
        include,
      });
      // El nombre del usuario de acceso se mantiene igual al del empleado
      if (updated.userId) {
        await tx.user.update({
          where: { id: updated.userId },
          data: { fullName: fullNameOf(updated) },
        });
      }
      return updated;
    });

    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: staff,
    });
    return staff;
  }

  async terminate(id: string, dto: TerminateStaffDto, actor: AuthUser) {
    const before = await this.findOne(id);
    if (before.status === StaffStatus.inactive) {
      throw new BadRequestException('El empleado ya está dado de baja');
    }
    const terminationDate = toDate(dto.terminationDate);
    if (terminationDate < before.hireDate) {
      throw new BadRequestException('La fecha de baja no puede ser anterior a la de contratación');
    }

    const staff = await this.prisma.$transaction(async (tx) => {
      if (before.userId) {
        await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
      }
      return tx.staff.update({
        where: { id },
        data: {
          status: StaffStatus.inactive,
          terminationDate,
          terminationReason: dto.terminationReason,
        },
        include,
      });
    });
    if (before.userId) await this.auth.revokeAllForUser(before.userId);

    await this.audit.log({
      userId: actor.id,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: staff,
    });
    return staff;
  }

  async grantAccess(id: string, dto: GrantAccessDto, actor: AuthUser) {
    const staff = await this.findOne(id);
    if (staff.userId) throw new ConflictException('El empleado ya tiene acceso al sistema');
    if (staff.status === StaffStatus.inactive) {
      throw new BadRequestException('No se puede dar acceso a un empleado dado de baja');
    }

    const role = resolveUserRole(staff.role, actor.role, dto.role);
    if (!role) {
      throw new ForbiddenException('Solo un administrador puede asignar un rol distinto al sugerido');
    }

    const passwordHash = await argon2.hash(dto.password);
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, fullName: fullNameOf(staff), role, passwordHash },
      });
      return tx.staff.update({ where: { id }, data: { userId: user.id }, include });
    });

    await this.audit.log({
      userId: actor.id,
      tableName: 'users',
      recordId: updated.userId!,
      actionType: ActionType.insert,
      newValues: { ...updated.user, staffId: id },
    });
    return updated;
  }
}
