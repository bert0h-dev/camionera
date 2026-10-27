import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
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
import {
  AcknowledgeEvaluationDto,
  CreateCriterionDto,
  CreateEvaluationDto,
  QueryEvaluationsDto,
  UpdateCriterionDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto.js';
import { EvaluationsService } from './evaluations.service.js';

const READERS = [UserRole.hr, UserRole.supervisor, UserRole.coordinator];
const EVALUATORS = [UserRole.hr, UserRole.supervisor];

@ApiTags('evaluations')
@ApiBearerAuth()
@Roles(UserRole.hr)
@Controller('evaluation-criteria')
export class EvaluationCriteriaController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  @Roles(...READERS)
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.evaluations.findCriteria(includeInactive ?? false);
  }

  @Post()
  create(@Body() dto: CreateCriterionDto, @CurrentUser() actor: AuthUser) {
    return this.evaluations.createCriterion(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCriterionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.evaluations.updateCriterion(id, dto, actor);
  }
}

/** Evaluaciones del propio empleado: cualquier usuario ligado a un empleado. */
@ApiTags('evaluations')
@ApiBearerAuth()
@Controller('evaluations/me')
export class MyEvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.evaluations.mine(user);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcknowledgeEvaluationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.evaluations.acknowledge(id, dto, user);
  }
}

@ApiTags('evaluations')
@ApiBearerAuth()
@Roles(...EVALUATORS)
@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  @Roles(...READERS)
  findAll(@Query() query: QueryEvaluationsDto) {
    return this.evaluations.findAll(query);
  }

  @Get(':id')
  @Roles(...READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEvaluationDto, @CurrentUser() actor: AuthUser) {
    return this.evaluations.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEvaluationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.evaluations.update(id, dto, actor);
  }

  @Post(':id/finalize')
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.evaluations.finalize(id, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.evaluations.remove(id, actor);
  }
}
