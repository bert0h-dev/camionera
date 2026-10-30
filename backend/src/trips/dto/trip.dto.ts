import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { TripStatus } from '../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const bool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class QueryTripsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-30',
    description: 'Fecha de salida; hoy si no se indica',
  })
  @IsOptional()
  @Matches(DATE, { message: 'Fecha inválida' })
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({
    description: 'Solo los que no tienen unidad o conductor',
  })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  unassigned?: boolean;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-10-30' })
  @IsOptional()
  @Matches(DATE, { message: 'Fecha inválida' })
  date?: string;
}

export class GenerateTripsDto {
  @ApiProperty({ example: '2026-10-30' })
  @Matches(DATE, { message: 'Fecha inválida' })
  from: string;

  @ApiProperty({ example: '2026-11-12' })
  @Matches(DATE, { message: 'Fecha inválida' })
  to: string;

  @ApiPropertyOptional({ description: 'Solo esta ruta' })
  @IsOptional()
  @IsUUID()
  routeId?: string;
}

export class CreateExtraTripDto {
  @ApiProperty()
  @IsUUID()
  routeId: string;

  @ApiProperty({
    example: '2026-10-31',
    description: 'Fecha de salida en la zona del origen',
  })
  @Matches(DATE, { message: 'Fecha inválida' })
  date: string;

  @ApiProperty({ example: '15:45', description: 'Hora local del origen' })
  @Matches(TIME, { message: 'Hora inválida (HH:mm)' })
  departureTime: string;

  @ApiPropertyOptional({
    description: 'Motivo del refuerzo o del servicio especial',
  })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
