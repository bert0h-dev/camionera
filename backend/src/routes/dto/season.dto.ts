import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SeasonType } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateSeasonDto {
  @ApiProperty({ example: 'Navidad y Año Nuevo' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: SeasonType })
  @IsEnum(SeasonType)
  seasonType: SeasonType;

  @ApiProperty({ example: '2026-12-15' })
  @IsDateString({ strict: true })
  validFrom: string;

  @ApiProperty({ example: '2027-01-06' })
  @IsDateString({ strict: true })
  validUntil: string;

  @ApiProperty({
    example: 25,
    description: 'Negativo en baja, positivo en alta o vacaciones, 0 en normal',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-90)
  @Max(200)
  priceModifierPercent: number;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class UpdateSeasonDto extends PartialType(CreateSeasonDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QuerySeasonsDto {
  @ApiPropertyOptional({
    example: 2026,
    description: 'Temporadas que tocan ese año; sin año, todas',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class FaresQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-20',
    description: 'Fecha del viaje; por defecto hoy',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
