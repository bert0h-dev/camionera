import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { GrantAccessDto } from './dto/grant-access.dto.js';
import { QueryStaffDto } from './dto/query-staff.dto.js';
import { TerminateStaffDto } from './dto/terminate-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffService } from './staff.service.js';

const READERS = [UserRole.hr, UserRole.supervisor, UserRole.coordinator];

@ApiTags('staff')
@ApiBearerAuth()
@Roles(UserRole.hr)
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Roles(...READERS)
  findAll(@Query() query: QueryStaffDto) {
    return this.staff.findAll(query);
  }

  @Get(':id')
  @Roles(...READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStaffDto, @CurrentUser() actor: AuthUser) {
    return this.staff.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.staff.update(id, dto, actor);
  }

  @Post(':id/terminate')
  terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateStaffDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.staff.terminate(id, dto, actor);
  }

  @Post(':id/credentials')
  grantAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantAccessDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.staff.grantAccess(id, dto, actor);
  }
}
