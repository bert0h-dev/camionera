import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { FilesService } from './files.service.js';

class UploadLogoDto {
  @ApiProperty({ example: 'logo.png' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ description: 'data:image/png;base64,…' })
  @IsString()
  @MaxLength(800_000)
  dataUrl: string;
}

@ApiTags('files')
@ApiBearerAuth()
@Roles(UserRole.admin)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** La imagen del logo; pública porque va en <img>, correos y la futura venta en línea. */
  @Public()
  @Get('company-logo')
  async logo(@Res() res: Response) {
    const f = await this.files.logo();
    if (!f) throw new NotFoundException('No hay logo');
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(f.data));
  }

  @Get('company-logo/info')
  logoInfo() {
    return this.files.logoInfo();
  }

  @Put('company-logo')
  setLogo(@Body() dto: UploadLogoDto, @CurrentUser() actor: AuthUser) {
    return this.files.setLogo(dto.fileName, dto.dataUrl, actor);
  }

  @Delete('company-logo')
  async removeLogo(@CurrentUser() actor: AuthUser) {
    await this.files.removeLogo(actor);
    return { ok: true };
  }
}
