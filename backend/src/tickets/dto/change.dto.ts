import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/enums.js';
import { PaymentDto } from './sale.dto.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class RefundDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Referencia de la devolución (tarjeta o transferencia)',
  })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  reference?: string | null;
}

export class CancelQuoteDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ticketIds: string[];
}

export class CancelTicketsDto extends CancelQuoteDto {
  @ApiProperty({ example: 'El pasajero ya no viaja' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    type: RefundDto,
    description: 'Cómo se devuelve (si hay reembolso)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RefundDto)
  refund?: RefundDto;

  @ApiPropertyOptional({
    description: 'Solo admin, fuera de plazo: monto total a devolver',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overrideAmount?: number;
}

export class StartChangeDto {
  @ApiProperty()
  @IsUUID()
  ticketId: string;

  @ApiProperty()
  @IsUUID()
  tripId: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  boardIndex: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  alightIndex: number;

  @ApiProperty({ example: '12' })
  @IsString()
  @MaxLength(6)
  seat: string;
}

export class CompleteChangeDto {
  @ApiPropertyOptional({
    type: [PaymentDto],
    description: 'Si el cliente paga diferencia',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];

  @ApiPropertyOptional({
    type: RefundDto,
    description: 'Si la diferencia es a favor del cliente',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RefundDto)
  refund?: RefundDto;
}

export class LookupDto {
  @ApiProperty({
    description: 'Folio de compra o boleto, o el contenido del QR',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  code: string;
}
