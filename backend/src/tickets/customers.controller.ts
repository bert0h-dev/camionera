import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CustomersService } from './customers.service.js';
import { UpdateCustomerDto } from './dto/customer.dto.js';
import { TICKET_READERS, TICKET_SELLERS } from './tickets.controller.js';

@ApiTags('customers')
@ApiBearerAuth()
@Roles(...TICKET_READERS)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() q: PaginationQueryDto) {
    return this.customers.list(q);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.detail(id);
  }

  @Patch(':id')
  @Roles(...TICKET_SELLERS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.update(id, dto, user);
  }
}
