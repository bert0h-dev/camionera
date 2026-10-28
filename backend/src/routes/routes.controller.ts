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
import {
  CreateRouteDto,
  QueryRoutesDto,
  UpdateRouteDto,
} from './dto/route.dto.js';
import { RoutesService } from './routes.service.js';

/** Coordinación (y admin) administra las rutas; supervisión y taquilla las consultan. */
export const ROUTE_READERS = [
  UserRole.coordinator,
  UserRole.supervisor,
  UserRole.vendor,
];
export const ROUTE_EDITORS = [UserRole.coordinator];

@ApiTags('routes')
@ApiBearerAuth()
@Roles(...ROUTE_EDITORS)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get('summary')
  @Roles(...ROUTE_READERS)
  summary() {
    return this.routes.summary();
  }

  @Get('form-options')
  formOptions() {
    return this.routes.formOptions();
  }

  @Get()
  @Roles(...ROUTE_READERS)
  findAll(@Query() q: QueryRoutesDto) {
    return this.routes.findAll(q);
  }

  @Get(':id')
  @Roles(...ROUTE_READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRouteDto, @CurrentUser() actor: AuthUser) {
    return this.routes.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.routes.update(id, dto, actor);
  }
}
