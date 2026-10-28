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
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CreateSeasonDto,
  QuerySeasonsDto,
  UpdateSeasonDto,
} from './dto/season.dto.js';
import { ROUTE_EDITORS, ROUTE_READERS } from './routes.controller.js';
import { SeasonsService } from './seasons.service.js';

@ApiTags('routes')
@ApiBearerAuth()
@Roles(...ROUTE_EDITORS)
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get('summary')
  @Roles(...ROUTE_READERS)
  summary() {
    return this.seasons.summary();
  }

  @Get()
  @Roles(...ROUTE_READERS)
  list(@Query() q: QuerySeasonsDto) {
    return this.seasons.list(q.year);
  }

  @Post()
  create(@Body() dto: CreateSeasonDto, @CurrentUser() actor: AuthUser) {
    return this.seasons.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSeasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.seasons.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.seasons.remove(id, actor);
  }
}
