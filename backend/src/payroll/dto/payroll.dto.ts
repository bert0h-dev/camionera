import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  AdjustmentType,
  PaymentFrequency,
  PaymentType,
  PayrollStatus,
} from '../../generated/prisma/enums.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateCompensationDto {
  @ApiProperty({ enum: PaymentType, default: PaymentType.daily })
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @ApiProperty({
    example: 420.5,
    description: 'Salario diario o sueldo mensual, en pesos',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El salario admite hasta 2 decimales' },
  )
  @IsPositive({ message: 'El salario debe ser mayor a cero' })
  @Max(9_999_999)
  baseSalary: number;

  @ApiProperty({ enum: PaymentFrequency, default: PaymentFrequency.weekly })
  @IsEnum(PaymentFrequency)
  paymentFrequency: PaymentFrequency;

  @ApiProperty({ example: '2026-11-01', description: 'Desde cuándo aplica' })
  @IsDateString({ strict: true })
  effectiveFrom: string;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreatePeriodDto {
  @ApiPropertyOptional({
    example: 'Semana 44',
    description: 'Si se omite se genera a partir de las fechas',
  })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;

  @ApiProperty({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  frequency: PaymentFrequency;

  @ApiProperty({ example: '2026-10-26' })
  @IsDateString({ strict: true })
  periodStart: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString({ strict: true })
  periodEnd: string;
}

export class QueryPeriodsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PayrollStatus })
  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;
}

export class CreateAdjustmentDto {
  @ApiProperty({ enum: AdjustmentType })
  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @ApiProperty({ example: 'Bono de puntualidad' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3, { message: 'Indica el concepto' })
  @MaxLength(150)
  concept: string;

  @ApiProperty({ example: 250 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El importe admite hasta 2 decimales' },
  )
  @IsPositive({ message: 'El importe debe ser mayor a cero' })
  @Max(9_999_999)
  amount: number;
}

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'xlsx';
}

export class PayrollSettingsDto {
  @ApiPropertyOptional({
    description: 'Descontar faltas por acumulación de retardos',
  })
  @IsOptional()
  @IsBoolean()
  latePenaltyEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Retardos que equivalen a una falta',
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  latesPerAbsence?: number;
}
