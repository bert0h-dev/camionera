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
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { BusDocumentType, BusStatus } from '../../generated/prisma/enums.js';

type Arg = { value: unknown };
const trim = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: Arg) =>
  typeof value === 'string'
    ? value.trim().toUpperCase().replace(/\s+/g, '')
    : value;
const optionalText = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() || null : value;

const MAX_YEAR = new Date().getFullYear() + 1;

export class CreateBusDto {
  @ApiProperty({
    example: '1024',
    description: 'Número económico, texto libre',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  economicNumber: string;

  @ApiProperty({ example: '123AB4C' })
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{5,15}$/, {
    message: 'Las placas deben tener de 5 a 15 letras, números o guiones',
  })
  plates: string;

  @ApiProperty({ example: '3AKJGLD51ESFL1234' })
  @Transform(upper)
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/, {
    message: 'El VIN debe tener 17 caracteres (sin I, O ni Q)',
  })
  vin: string;

  @ApiProperty({ example: 2022 })
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(MAX_YEAR)
  year: number;

  @ApiProperty()
  @IsUUID()
  busModelId: string;

  @ApiProperty()
  @IsUUID()
  terminalId: string;

  @ApiPropertyOptional({ example: 125000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  odometerKm?: number;

  @ApiPropertyOptional({
    description: 'Plan preventivo propio (km); vacío = el del modelo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(200_000)
  preventiveKm?: number | null;

  @ApiPropertyOptional({
    description: 'Plan preventivo propio (días); vacío = el del modelo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(730)
  preventiveDays?: number | null;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  notes?: string | null;
}

/** El odómetro se cambia con su propia ruta para dejar historial. */
export class UpdateBusDto extends PartialType(
  OmitType(CreateBusDto, ['odometerKm'] as const),
) {}

export class QueryBusesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BusStatus })
  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  terminalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  busModelId?: string;
}

export class ChangeBusStatusDto {
  @ApiProperty({ enum: BusStatus })
  @IsEnum(BusStatus)
  status: BusStatus;

  @ApiPropertyOptional({
    description: 'Obligatorio para mantenimiento y fuera de servicio',
  })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class OdometerDto {
  @ApiProperty({ example: 130250 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  km: number;
}

export class BlockSeatDto {
  @ApiProperty()
  @IsBoolean()
  blocked: boolean;

  @ApiPropertyOptional({ description: 'Obligatorio al bloquear' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string | null;
}

export class CreateBusDocumentDto {
  @ApiProperty({ enum: BusDocumentType })
  @IsEnum(BusDocumentType)
  type: BusDocumentType;

  @ApiProperty({ example: 'POL-889911' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  folio: string;

  @ApiPropertyOptional({ example: 'Qualitas' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuer?: string | null;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString({ strict: true })
  issueDate: string;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiryDate?: string | null;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateBusDocumentDto extends PartialType(
  OmitType(CreateBusDocumentDto, ['type'] as const),
) {}
