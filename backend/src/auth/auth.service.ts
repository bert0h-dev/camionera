import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth.types.js';

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.refreshTtlMs = Number(config.get('JWT_REFRESH_TTL_DAYS') ?? 7) * 24 * 60 * 60 * 1000;
  }

  async login(email: string, password: string, meta: SessionMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      omit: { passwordHash: false },
    });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const { passwordHash: _hash, ...safeUser } = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
      omit: { passwordHash: false },
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
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Sesión inválida');
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Sesión expirada');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return { user: stored.user, ...(await this.issueTokens(stored.user, meta)) };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      omit: { passwordHash: false },
    });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword) },
    });
    await this.revokeAllForUser(userId);
  }

  private async issueTokens(
    user: { id: string; email: string; role: JwtPayload['role'] },
    meta: SessionMeta,
  ) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    return { accessToken, refreshToken };
  }
}
