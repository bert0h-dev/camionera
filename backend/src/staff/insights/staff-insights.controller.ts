import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../generated/prisma/enums.js';
import { StaffInsightsService } from './staff-insights.service.js';

const READERS = [UserRole.hr, UserRole.supervisor, UserRole.coordinator];

/** Va antes de StaffController: /staff/stats debe ganar a /staff/:id. */
@ApiTags('staff')
@ApiBearerAuth()
@Roles(...READERS)
@Controller('staff')
export class StaffInsightsController {
  constructor(private readonly insights: StaffInsightsService) {}

  @Get('stats')
  stats() {
    return this.insights.stats();
  }

  @Get(':id/summary')
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.insights.summary(id);
  }
}
