import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { PaymentMethod } from '../../generated/prisma/enums.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' ? false : value;

export class PassengerDto {
  @ApiProperty()
  @IsUUID()
  ticketId: string;

  @ApiProperty({ example: 'Ana López Ruiz' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsUUID()
  passengerTypeId: string;

  @ApiPropertyOptional({ description: 'Credencial INAPAM, escolar, INE…' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(50)
  document?: string | null;
}

export class SetPassengersDto {
  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];

  @ApiPropertyOptional({ description: 'Quien compra (opcional en taquilla)' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(255)
  contactName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(255)
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^[0-9+() -]{7,20}$/, { message: 'Teléfono inválido' })
  contactPhone?: string | null;
}

export class PaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ example: 860 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Efectivo recibido' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  received?: number | null;

  @ApiPropertyOptional({ description: 'Autorización o referencia' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  reference?: string | null;
}

export class PayDto {
  @ApiProperty({ type: [PaymentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];
}

export class SendTicketsDto {
  @ApiPropertyOptional({
    description: 'Otro correo; si falta se usa el de la compra',
  })
  @IsOptional()
  @Transform(trimOrNull)
  @IsEmail({}, { message: 'Correo inválido' })
  email?: string | null;
}

export class QueryOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-11-02' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ description: 'true = solo mis ventas' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;
}
