import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, SessionMeta } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';

const REFRESH_COOKIE = 'refresh_token';

const cookieOf = (req: Request) =>
  req.cookies?.[REFRESH_COOKIE] as string | undefined;

// Las rutas de sesiones viven bajo /auth porque la cookie del refresh token solo se envía ahí
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.login(
      dto.email,
      dto.password,
      this.meta(req),
    );
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return { user, accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { user, accessToken, refreshToken } = await this.auth.refresh(
        cookieOf(req) ?? '',
        this.meta(req),
      );
      res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
      return { user, accessToken };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(cookieOf(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        staff: { select: { id: true, employeeNumber: true, role: true } },
      },
    });
  }

  /** Cambia la contraseña propia; la sesión actual sigue abierta y las demás se cierran. */
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      cookieOf(req),
    );
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.sessions(user.id, cookieOf(req));
  }

  @ApiBearerAuth()
  @Post('sessions/revoke-others')
  @HttpCode(204)
  async revokeOthers(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.auth.revokeOtherSessions(user.id, cookieOf(req));
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revokeSession(user.id, id);
  }

  private meta(req: Request): SessionMeta {
    return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: this.auth.refreshTtlMs,
    };
  }
}
