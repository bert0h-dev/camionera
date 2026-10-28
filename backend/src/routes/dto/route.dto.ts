import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
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

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const ROUTE_SORTS = ['code', 'name', 'distanceKm', 'basePrice'] as const;

export class CreateRouteDto {
  @ApiProperty({
    example: 'GDL-MEX-01',
    description: 'Clave única en mayúsculas',
  })
  @Transform(upper)
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,19}$/, {
    message: 'La clave debe tener de 2 a 20 letras, números o guiones',
  })
  code: string;

  @ApiProperty({ example: 'Guadalajara – Ciudad de México' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsUUID()
  originTerminalId: string;

  @ApiProperty()
  @IsUUID()
  destinationTerminalId: string;

  @ApiProperty({ example: 650, description: 'Precio base del boleto completo' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(99999)
  basePrice: number;

  @ApiProperty({ example: 420, description: 'Duración estimada en minutos' })
  @IsInt()
  @Min(10)
  @Max(4320)
  estimatedDurationMinutes: number;

  @ApiProperty({ example: 540 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(99999)
  distanceKm: number;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class UpdateRouteDto extends PartialType(CreateRouteDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryRoutesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Ciudad de origen' })
  @IsOptional()
  @IsUUID()
  originCityId?: string;

  @ApiPropertyOptional({ description: 'Ciudad de destino' })
  @IsOptional()
  @IsUUID()
  destinationCityId?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'all'],
    default: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ enum: ROUTE_SORTS })
  @IsOptional()
  @IsIn(ROUTE_SORTS)
  sort?: (typeof ROUTE_SORTS)[number];
}
