import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { ActionType, SecurityEventType } from '../../generated/prisma/enums.js';

class DateRangeQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class AuditLogQueryDto extends DateRangeQuery {
  @ApiPropertyOptional({ example: 'staff' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tableName?: string;

  @ApiPropertyOptional({ enum: ActionType })
  @IsOptional()
  @IsEnum(ActionType)
  actionType?: ActionType;

  @ApiPropertyOptional({ description: 'Id del registro afectado' })
  @IsOptional()
  @IsUUID()
  recordId?: string;
}

export class SecurityEventQueryDto extends DateRangeQuery {
  @ApiPropertyOptional({ enum: SecurityEventType })
  @IsOptional()
  @IsEnum(SecurityEventType)
  type?: SecurityEventType;
}
