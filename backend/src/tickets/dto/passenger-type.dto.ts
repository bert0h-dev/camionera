import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SeasonType } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PassengerTypeDto {
  @ApiProperty({ example: 'INAPAM' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, {
    message:
      'La clave lleva de 2 a 20 letras, números, guiones o guiones bajos',
  })
  code: string;

  @ApiProperty({ example: 'Adulto mayor (INAPAM)' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 50 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent: number;

  @ApiPropertyOptional({
    description: 'Máximo por recorrido; null = sin cupo',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPerTrip?: number | null;

  @ApiPropertyOptional({ description: 'Pide credencial al abordar' })
  @IsOptional()
  @IsBoolean()
  requiresId?: boolean;

  @ApiPropertyOptional({
    enum: SeasonType,
    isArray: true,
    description:
      'El descuento solo aplica en estas temporadas (vacío = siempre)',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(SeasonType, { each: true })
  seasonTypes?: SeasonType[];

  @ApiPropertyOptional({ description: 'Tipo propuesto al capturar pasajeros' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePassengerTypeDto extends PartialType(PassengerTypeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
