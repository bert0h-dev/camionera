import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { FuelLoadStatus } from '../../generated/prisma/enums.js';

type Arg = { value: unknown };
const trim = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() : value;
const optionalText = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateFuelLoadDto {
  @ApiProperty()
  @IsUUID()
  busId: string;

  @ApiProperty({ example: '2026-10-28T08:15:00-06:00' })
  @IsDateString()
  loadedAt: string;

  @ApiProperty({ example: 320.5, description: 'En la unidad del combustible' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  quantity: number;

  @ApiProperty({ example: 25.899, description: 'Precio por unidad del día' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(10_000)
  unitPrice: number;

  @ApiProperty({ example: 152300 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  odometerKm: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isFullTank?: boolean;

  @ApiPropertyOptional({ example: 'Pemex Periférico Sur' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  station?: string | null;

  @ApiPropertyOptional({ example: 'A-123456' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ticket?: string | null;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** La unidad no cambia: si se equivocaron, se elimina y se registra de nuevo. */
export class UpdateFuelLoadDto extends PartialType(
  OmitType(CreateFuelLoadDto, ['busId'] as const),
) {}

export class QueryFuelLoadDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FuelLoadStatus })
  @IsOptional()
  @IsEnum(FuelLoadStatus)
  status?: FuelLoadStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  busId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  terminalId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class QueryFuelEfficiencyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  busId?: string;
}

export class RejectFuelLoadDto {
  @ApiProperty({ description: 'Por qué se rechaza la carga' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
