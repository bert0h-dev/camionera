import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { StaffStatus } from '../../generated/prisma/enums.js';
import { CreateStaffDto } from './create-staff.dto.js';

// La baja (inactive) solo se hace con POST /staff/:id/terminate
export const EDITABLE_STATUSES = [
  StaffStatus.active,
  StaffStatus.vacation,
  StaffStatus.sick_leave,
  StaffStatus.suspended,
] as const;

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: (typeof EDITABLE_STATUSES)[number];
}
