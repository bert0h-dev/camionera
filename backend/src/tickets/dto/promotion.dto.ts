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
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DiscountType, SaleChannel } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PromotionDto {
  @ApiProperty({ example: 'BUENFIN25' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/, {
    message:
      'La clave lleva de 3 a 30 letras, números, guiones o guiones bajos',
  })
  code: string;

  @ApiProperty({ example: 'Buen Fin 2026' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: 25, description: '% o monto en pesos' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  discountValue: number;

  @ApiPropertyOptional({
    description: 'Tope del descuento cuando es porcentaje',
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxDiscount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPurchase?: number;

  @ApiProperty({ example: '2026-11-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validFrom: string;

  @ApiProperty({ example: '2026-11-16' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validUntil: string;

  @ApiPropertyOptional({
    enum: SaleChannel,
    isArray: true,
    description: 'Vacío = todos',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(SaleChannel, { each: true })
  channels?: SaleChannel[];
}

export class UpdatePromotionDto extends PartialType(PromotionDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ApplyPromotionDto {
  @ApiProperty({ example: 'BUENFIN25' })
  @Transform(upper)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  code: string;
}
