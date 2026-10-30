import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { SaleChannel } from '../../generated/prisma/enums.js';

export class ReportRangeDto {
  @ApiProperty({ example: '2026-11-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @ApiProperty({ example: '2026-11-30' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;
}

export class SalesReportDto extends ReportRangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({
    description: 'Vendedor (el vendedor solo ve las suyas)',
  })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({ enum: SaleChannel })
  @IsOptional()
  @IsEnum(SaleChannel)
  channel?: SaleChannel;
}
