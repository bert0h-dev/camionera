import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogQueryDto } from './dto/fleet.dto.js';
import {
  CloseIncidentDto,
  CreateIncidentDto,
  IncidentCategoryDto,
  IncidentOrderDto,
  QueryIncidentDto,
  UpdateIncidentCategoryDto,
  UpdateIncidentDto,
} from './dto/incident.dto.js';
import { FLEET_EDITORS, FLEET_READERS } from './fleet.controller.js';
import { IncidentsService } from './incidents.service.js';

/** Reportan: la flota, el conductor y el mecánico (estos dos solo ven lo suyo). */
const REPORTERS = [...FLEET_READERS, UserRole.driver, UserRole.mechanic];

@ApiTags('fleet')
@ApiBearerAuth()
@Roles(...FLEET_READERS)
@Controller('fleet/incidents')
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('summary')
  @Roles(...REPORTERS)
  summary(@CurrentUser() actor: AuthUser) {
    return this.incidents.summary(actor);
  }

  /** Unidades para elegir al reportar (el conductor no tiene acceso a la flota). */
  @Get('buses')
  @Roles(...REPORTERS)
  buses() {
    return this.prisma.bus.findMany({
      select: { id: true, economicNumber: true, plates: true, status: true },
      orderBy: { economicNumber: 'asc' },
    });
  }

  @Get('categories')
  @Roles(...REPORTERS)
  categories(@Query() q: CatalogQueryDto) {
    return this.incidents.categories(q.includeInactive);
  }

  @Post('categories')
  @Roles(...FLEET_EDITORS)
  createCategory(
    @Body() dto: IncidentCategoryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.createCategory(dto, actor);
  }

  @Patch('categories/:id')
  @Roles(...FLEET_EDITORS)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentCategoryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.updateCategory(id, dto, actor);
  }

  @Get()
  @Roles(...REPORTERS)
  findAll(@Query() q: QueryIncidentDto, @CurrentUser() actor: AuthUser) {
    return this.incidents.findAll(q, actor);
  }

  @Get(':id')
  @Roles(...REPORTERS)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.findOne(id, actor);
  }

  @Post()
  @Roles(...REPORTERS)
  create(@Body() dto: CreateIncidentDto, @CurrentUser() actor: AuthUser) {
    return this.incidents.create(dto, actor);
  }

  @Patch(':id')
  @Roles(...REPORTERS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.update(id, dto, actor);
  }

  @Post(':id/review')
  @HttpCode(200)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.review(id, actor);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseIncidentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.resolve(id, dto, actor);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseIncidentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.dismiss(id, dto, actor);
  }

  @Post(':id/order')
  @Roles(...FLEET_EDITORS)
  createOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IncidentOrderDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.createOrder(id, dto, actor);
  }
}
