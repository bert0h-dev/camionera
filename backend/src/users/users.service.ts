import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service.js';
import { SecurityEventsService } from '../audit/security-events.service.js';
import { AuthService } from '../auth/auth.service.js';
import { paginate } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { ActionType, SecurityEventType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const TABLE = 'users';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly security: SecurityEventsService,
  ) {}

  async findAll(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      isActive: query.isActive,
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  findOne(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateUserDto, actorId: string) {
    const { password, ...data } = dto;
    const user = await this.prisma.user.create({
      data: { ...data, passwordHash: await argon2.hash(password) },
    });
    await this.audit.log({
      userId: actorId,
      tableName: TABLE,
      recordId: user.id,
      actionType: ActionType.insert,
      newValues: user,
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    if (
      id === actorId &&
      (dto.isActive === false || (dto.role && dto.role !== 'admin'))
    ) {
      throw new BadRequestException(
        'No puedes desactivarte ni quitarte el rol de administrador',
      );
    }

    const before = await this.findOne(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    if (dto.isActive === false || (dto.role && dto.role !== before.role)) {
      await this.auth.revokeAllForUser(id);
    }

    await this.audit.log({
      userId: actorId,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      oldValues: before,
      newValues: user,
    });
    return user;
  }

  /** Ficha del usuario: empleado ligado, sesiones abiertas y su actividad reciente. */
  async detail(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        staff: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            secondLastName: true,
            role: true,
          },
        },
      },
    });
    const [sessions, activity] = await Promise.all([
      this.auth.sessions(id),
      this.prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          tableName: true,
          recordId: true,
          actionType: true,
          createdAt: true,
        },
      }),
    ]);
    return { ...user, sessions, activity };
  }

  async forcePasswordChange(id: string, actorId: string) {
    await this.prisma.user.update({
      where: { id },
      data: { mustChangePassword: true },
    });
    await this.logAction(id, actorId, { mustChangePassword: true });
  }

  async revokeSessions(id: string, actorId: string) {
    await this.auth.revokeAllForUser(id);
    await this.logAction(id, actorId, { sessionsRevoked: true });
    await this.security.log({
      type: SecurityEventType.sessions_revoked,
      userId: id,
      details: { scope: 'all', by: actorId },
    });
  }

  async unlock(id: string, actorId: string) {
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });
    await this.logAction(id, actorId, { unlocked: true });
    await this.security.log({
      type: SecurityEventType.account_unlocked,
      userId: id,
      details: { by: actorId },
    });
  }

  private logAction(id: string, actorId: string, newValues: object) {
    return this.audit.log({
      userId: actorId,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      newValues,
    });
  }

  /** El admin asigna una contraseña temporal: el usuario deberá cambiarla al entrar. */
  async resetPassword(id: string, password: string, actorId: string) {
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await argon2.hash(password),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.auth.revokeAllForUser(id);
    await this.audit.log({
      userId: actorId,
      tableName: TABLE,
      recordId: id,
      actionType: ActionType.update,
      newValues: { passwordReset: true },
    });
  }
}
