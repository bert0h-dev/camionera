import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { MX_TIMEZONES } from '../../common/timezones.js';
import { BusType } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class CatalogQueryDto {
  @ApiPropertyOptional({ description: 'true = incluye los desactivados' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeInactive?: boolean;
}

// ---------- Combustibles ----------

export class CreateFuelTypeDto {
  @ApiProperty({ example: 'Diésel' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 'L' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  unit: string;
}

export class UpdateFuelTypeDto extends PartialType(CreateFuelTypeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Ciudades y terminales ----------

export class CreateCityDto {
  @ApiProperty({ example: 'Guadalajara' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Jalisco' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state: string;

  @ApiPropertyOptional({
    example: 'America/Mexico_City',
    enum: MX_TIMEZONES,
    description: 'Zona horaria; los horarios de las rutas se calculan con ella',
  })
  @IsOptional()
  @IsIn(MX_TIMEZONES, { message: 'Zona horaria no válida' })
  timezone?: string;
}

export class UpdateCityDto extends PartialType(CreateCityDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTerminalDto {
  @ApiProperty({ example: 'GDL', description: 'Clave corta en mayúsculas' })
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2,10}$/, {
    message: 'La clave debe tener de 2 a 10 letras o números',
  })
  code: string;

  @ApiProperty({ example: 'Central Nueva de Guadalajara' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  name: string;

  @ApiProperty()
  @IsUUID()
  cityId: string;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional({
    example: 20.6597,
    description: 'Se envía junto con la longitud; null quita la ubicación',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ example: -103.3496 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}

export class TerminalQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({
    description:
      'true = solo terminales con ubicación (las que se pueden usar)',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  located?: boolean;
}

export class UpdateTerminalDto extends PartialType(CreateTerminalDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePlatformDto {
  @ApiProperty({ example: 'A3', description: 'Clave del andén en la terminal' })
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{1,10}$/, {
    message: 'La clave del andén debe tener de 1 a 10 letras o números',
  })
  code: string;

  @ApiPropertyOptional({ example: 'Andén norte' })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;
}

export class UpdatePlatformDto extends PartialType(CreatePlatformDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Modelos de bus ----------

export class CreateBusModelDto {
  @ApiProperty({ example: 'Volvo' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  brand: string;

  @ApiProperty({ example: '9800 DD' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model: string;

  @ApiProperty({ enum: BusType })
  @IsEnum(BusType)
  busType: BusType;

  @ApiProperty()
  @IsUUID()
  fuelTypeId: string;

  @ApiPropertyOptional({ example: 400 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000)
  tankCapacity?: number | null;

  @ApiPropertyOptional({
    example: 3.2,
    description: 'km por unidad de combustible',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  expectedEfficiency?: number | null;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  specifications?: string | null;

  @ApiPropertyOptional({ example: ['WiFi', 'Baño', 'A/C'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  features?: string[];

  @ApiPropertyOptional({
    example: 15000,
    description: 'Servicio preventivo cada N km',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(200_000)
  preventiveKm?: number | null;

  @ApiPropertyOptional({
    example: 90,
    description: 'Servicio preventivo cada N días',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(730)
  preventiveDays?: number | null;

  @ApiProperty({ description: 'Plantilla de asientos (ver layout-rules.ts)' })
  @IsObject()
  layout: Record<string, unknown>;
}

export class UpdateBusModelDto extends PartialType(CreateBusModelDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryBusModelsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BusType })
  @IsOptional()
  @IsEnum(BusType)
  busType?: BusType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeInactive?: boolean;
}

export class DefaultLayoutQueryDto {
  @ApiPropertyOptional({ default: 11 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  rows: number = 11;

  @ApiPropertyOptional({ default: 1, enum: [1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  floors: number = 1;
}
