import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class StopItemDto {
  @ApiProperty()
  @IsUUID()
  terminalId: string;

  @ApiProperty({
    example: 220,
    description: 'Km del tramo desde el punto anterior',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(9999)
  legKm: number;

  @ApiProperty({ example: 200, description: 'Minutos desde la salida' })
  @IsInt()
  @Min(1)
  @Max(4320)
  durationFromOriginMinutes: number;

  @ApiProperty({
    example: 390,
    description: 'Precio del boleto del origen hasta esta parada',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(99999)
  priceFromOrigin: number;
}

/** Itinerario completo: reemplaza las paradas de la ruta. */
export class ReplaceStopsDto {
  @ApiProperty({ type: [StopItemDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StopItemDto)
  stops: StopItemDto[];

  @ApiPropertyOptional({
    example: 215,
    description:
      'Km del último tramo hasta el destino (obligatorio con paradas; sin paradas es la distancia directa, opcional)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(9999)
  finalLegKm?: number | null;
}
