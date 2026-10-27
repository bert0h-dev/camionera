import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { SecurityEventsService } from '../audit/security-events.service.js';
import { ActionType, SecurityEventType } from '../generated/prisma/enums.js';
import { brandedEmail, MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { JwtPayload } from './auth.types.js';

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora
const RESET_MAX_PER_HOUR = 3;
const MINUTE_MS = 60 * 1000;

@Injectable()
export class AuthService {
  readonly refreshTtlMs: number;
  private readonly frontendUrl: string;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly security: SecurityEventsService,
    config: ConfigService,
  ) {
    this.refreshTtlMs =
      Number(config.get('JWT_REFRESH_TTL_DAYS') ?? 7) * 24 * 60 * 60 * 1000;
    this.frontendUrl =
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  /**
   * Inicio de sesión con bloqueo temporal: tras N intentos fallidos la cuenta queda
   * bloqueada M minutos. Los mensajes no revelan si el correo existe.
   */
  async login(email: string, password: string, meta: SessionMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      omit: { passwordHash: false },
    });
    const event = {
      email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };
    if (!user || !user.isActive) {
      await this.security.log({
        ...event,
        type: SecurityEventType.login_failed,
        userId: user?.id,
        details: { reason: user ? 'inactive' : 'unknown_email' },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - now.getTime()) / MINUTE_MS,
      );
      await this.security.log({
        ...event,
        type: SecurityEventType.login_failed,
        userId: user.id,
        details: { reason: 'locked' },
      });
      throw new UnauthorizedException(
        `Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutes} min o pide al administrador que la desbloquee.`,
      );
    }

    if (!(await argon2.verify(user.passwordHash, password))) {
      const [maxAttempts, lockMinutes] = await Promise.all([
        this.settings.get('security.max_failed_logins'),
        this.settings.get('security.lockout_minutes'),
      ]);
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= maxAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: lock
          ? {
              failedLoginAttempts: 0,
              lockedUntil: new Date(now.getTime() + lockMinutes * MINUTE_MS),
            }
          : { failedLoginAttempts: attempts },
      });
      await this.security.log({
        ...event,
        type: SecurityEventType.login_failed,
        userId: user.id,
        details: { reason: 'wrong_password', attempts },
      });
      if (lock)
        await this.security.log({
          ...event,
          type: SecurityEventType.account_locked,
          userId: user.id,
          details: { minutes: lockMinutes },
        });
      throw new UnauthorizedException(
        lock
          ? `Demasiados intentos fallidos. La cuenta quedó bloqueada ${lockMinutes} min.`
          : 'Credenciales inválidas',
      );
    }

    const { passwordHash: _hash, ...safeUser } = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: now, failedLoginAttempts: 0, lockedUntil: null },
      omit: { passwordHash: false },
    });
    await this.security.log({
      ...event,
      type: SecurityEventType.login_success,
      userId: user.id,
    });
    return { user: safeUser, ...(await this.issueTokens(safeUser, meta)) };
  }

  /** Rota el refresh token. Si se reutiliza uno ya revocado se cierran todas las sesiones del usuario. */
  async refresh(refreshToken: string, meta: SessionMeta) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Sesión inválida');

    if (stored.revokedAt) {
      // Un token ya usado volvió a llegar: posible robo de la cookie
      await this.revokeAllForUser(stored.userId);
      await this.security.log({
        type: SecurityEventType.token_reuse,
        userId: stored.userId,
        email: stored.user.email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Sesión inválida');
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Sesión expirada');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return {
      user: stored.user,
      ...(await this.issueTokens(stored.user, meta, stored.sessionStartedAt)),
    };
  }

  async logout(refreshToken: string | undefined, meta: SessionMeta = {}) {
    if (!refreshToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.revokedAt) return;
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    await this.security.log({
      type: SecurityEventType.logout,
      userId: stored.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async revokeAllForUser(userId: string, exceptTokenHash?: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptTokenHash && { tokenHash: { not: exceptTokenHash } }),
      },
      data: { revokedAt: new Date() },
    });
  }

  /** Cambia la contraseña propia; cierra las demás sesiones y conserva la actual. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentRefreshToken?: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { passwordHash: false },
    });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    if (await argon2.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(newPassword),
        mustChangePassword: false,
      },
    });
    await this.revokeAllForUser(
      userId,
      currentRefreshToken && hashToken(currentRefreshToken),
    );
    await this.audit.log({
      userId,
      tableName: 'users',
      recordId: userId,
      actionType: ActionType.update,
      newValues: { passwordChanged: true },
    });
    await this.security.log({
      type: SecurityEventType.password_changed,
      userId,
      email: user.email,
    });
  }

  // ---------- Sesiones ----------

  /** Sesiones abiertas (un refresh token vigente por sesión); marca la del navegador actual. */
  async sessions(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken && hashToken(currentRefreshToken);
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      startedAt: r.sessionStartedAt,
      lastActiveAt: r.createdAt,
      expiresAt: r.expiresAt,
      current: r.tokenHash === currentHash,
    }));
  }

  /** Cierra todas las sesiones excepto la del navegador que hace la petición. */
  async revokeOtherSessions(userId: string, currentRefreshToken?: string) {
    if (!currentRefreshToken)
      throw new BadRequestException('No se pudo identificar la sesión actual');
    await this.revokeAllForUser(userId, hashToken(currentRefreshToken));
    await this.security.log({
      type: SecurityEventType.sessions_revoked,
      userId,
      details: { scope: 'others' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Sesión no encontrada');
    await this.security.log({
      type: SecurityEventType.sessions_revoked,
      userId,
      details: { scope: 'one', sessionId },
    });
  }

  // ---------- Recuperación por correo ----------

  /** Siempre responde igual, exista o no el correo, para no revelar cuentas. */
  async requestPasswordReset(email: string, meta: SessionMeta = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    await this.security.log({
      type: SecurityEventType.password_reset_requested,
      userId: user?.id,
      email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: user?.isActive ? undefined : { sent: false },
    });
    if (!user || !user.isActive) return;

    const recent = await this.prisma.passwordReset.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - 60 * MINUTE_MS) },
      },
    });
    if (recent >= RESET_MAX_PER_HOUR) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    const url = `${this.frontendUrl}/restablecer?token=${token}`;
    try {
      await this.mail.send({
        to: user.email,
        subject: 'Restablece tu contraseña · Central Camionera',
        text: `Hola ${user.fullName}. Para restablecer tu contraseña abre este enlace (vence en 1 hora): ${url}\nSi no lo solicitaste, ignora este correo.`,
        html: brandedEmail({
          title: 'Restablece tu contraseña',
          intro: `Hola ${user.fullName}, recibimos una solicitud para restablecer la contraseña de tu cuenta.`,
          action: { label: 'Crear nueva contraseña', url },
          outro:
            'El enlace vence en 1 hora y solo se puede usar una vez. Si no lo solicitaste, ignora este correo.',
        }),
      });
    } catch (err) {
      // No se informa al solicitante para no revelar si la cuenta existe
      this.logger.error(
        `Fallo al enviar el correo de recuperación: ${(err as Error).message}`,
      );
    }
  }

  async resetPassword(
    token: string,
    newPassword: string,
    meta: SessionMeta = {},
  ) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !reset ||
      reset.usedAt ||
      reset.expiresAt < new Date() ||
      !reset.user.isActive
    ) {
      throw new BadRequestException(
        'El enlace no es válido o ya venció. Solicita uno nuevo.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash: await argon2.hash(newPassword),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      // Invalida este y cualquier otro enlace pendiente
      this.prisma.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.revokeAllForUser(reset.userId);
    await this.audit.log({
      userId: reset.userId,
      tableName: 'users',
      recordId: reset.userId,
      actionType: ActionType.update,
      newValues: { passwordReset: 'email' },
    });
    await this.security.log({
      type: SecurityEventType.password_reset,
      userId: reset.userId,
      email: reset.user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private async issueTokens(
    user: { id: string; email: string; role: JwtPayload['role'] },
    meta: SessionMeta,
    sessionStartedAt?: Date,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        sessionStartedAt,
      },
    });
    return { accessToken, refreshToken };
  }
}
