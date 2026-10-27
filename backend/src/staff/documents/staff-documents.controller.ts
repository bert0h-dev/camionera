import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../auth/auth.types.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../generated/prisma/enums.js';
import { CreateCertificationDto, UpdateCertificationDto } from './dto/certification.dto.js';
import { CreateLicenseDto, UpdateLicenseDto } from './dto/license.dto.js';
import { QueryExpirationsDto } from './dto/query-expirations.dto.js';
import { StaffDocumentsService } from './staff-documents.service.js';

const READERS = [UserRole.hr, UserRole.supervisor, UserRole.coordinator];

// Se registra antes que StaffController para que /staff/expirations no caiga en /staff/:id
@ApiTags('staff-documents')
@ApiBearerAuth()
@Roles(UserRole.hr)
@Controller('staff')
export class StaffDocumentsController {
  constructor(private readonly docs: StaffDocumentsService) {}

  @Get('expirations')
  @Roles(...READERS)
  expirations(@Query() query: QueryExpirationsDto) {
    return this.docs.expirations(query.days);
  }

  @Get(':id/compliance')
  @Roles(...READERS)
  compliance(@Param('id', ParseUUIDPipe) id: string) {
    return this.docs.isDriverCompliant(id);
  }

  // ---------- Licencias ----------

  @Get(':id/licenses')
  @Roles(...READERS)
  listLicenses(@Param('id', ParseUUIDPipe) staffId: string) {
    return this.docs.listLicenses(staffId);
  }

  @Post(':id/licenses')
  createLicense(
    @Param('id', ParseUUIDPipe) staffId: string,
    @Body() dto: CreateLicenseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.docs.createLicense(staffId, dto, actor);
  }

  @Patch('licenses/:licenseId')
  updateLicense(
    @Param('licenseId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLicenseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.docs.updateLicense(id, dto, actor);
  }

  @Delete('licenses/:licenseId')
  @HttpCode(204)
  deleteLicense(@Param('licenseId', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.docs.deleteLicense(id, actor);
  }

  // ---------- Certificaciones ----------

  @Get(':id/certifications')
  @Roles(...READERS)
  listCertifications(@Param('id', ParseUUIDPipe) staffId: string) {
    return this.docs.listCertifications(staffId);
  }

  @Post(':id/certifications')
  createCertification(
    @Param('id', ParseUUIDPipe) staffId: string,
    @Body() dto: CreateCertificationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.docs.createCertification(staffId, dto, actor);
  }

  @Patch('certifications/:certificationId')
  updateCertification(
    @Param('certificationId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.docs.updateCertification(id, dto, actor);
  }

  @Delete('certifications/:certificationId')
  @HttpCode(204)
  deleteCertification(
    @Param('certificationId', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.docs.deleteCertification(id, actor);
  }
}
