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
import { BusesService } from './buses.service.js';
import {
  BlockSeatDto,
  ChangeBusStatusDto,
  CreateBusDocumentDto,
  CreateBusDto,
  OdometerDto,
  QueryBusesDto,
  UpdateBusDocumentDto,
  UpdateBusDto,
} from './dto/bus.dto.js';
import { FLEET_EDITORS, FLEET_READERS } from './fleet.controller.js';

@ApiTags('fleet')
@ApiBearerAuth()
@Roles(...FLEET_EDITORS)
@Controller('fleet/buses')
export class BusesController {
  constructor(private readonly buses: BusesService) {}

  @Get()
  @Roles(...FLEET_READERS)
  findAll(@Query() q: QueryBusesDto) {
    return this.buses.findAll(q);
  }

  @Get('summary')
  @Roles(...FLEET_READERS)
  summary() {
    return this.buses.summary();
  }

  @Get('expiring-documents')
  @Roles(...FLEET_READERS)
  expiringDocuments() {
    return this.buses.expiringDocuments();
  }

  @Get(':id')
  @Roles(...FLEET_READERS)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.buses.findOne(id);
  }

  @Get(':id/history')
  @Roles(...FLEET_READERS)
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.buses.history(id);
  }

  @Post()
  create(@Body() dto: CreateBusDto, @CurrentUser() actor: AuthUser) {
    return this.buses.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.update(id, dto, actor);
  }

  @Post(':id/status')
  @HttpCode(200)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBusStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.changeStatus(id, dto, actor);
  }

  @Post(':id/odometer')
  @HttpCode(200)
  odometer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OdometerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.recordOdometer(id, dto.km, actor);
  }

  @Patch(':id/seats/:seatId')
  blockSeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @Body() dto: BlockSeatDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.blockSeat(id, seatId, dto, actor);
  }

  @Post(':id/documents')
  createDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBusDocumentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.createDocument(id, dto, actor);
  }

  @Patch(':id/documents/:docId')
  updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: UpdateBusDocumentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.updateDocument(id, docId, dto, actor);
  }

  @Delete(':id/documents/:docId')
  @HttpCode(204)
  deleteDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.buses.deleteDocument(id, docId, actor);
  }
}
