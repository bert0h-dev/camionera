import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class SegmentQueryDto {
  @ApiProperty({ description: 'Índice del punto de subida (0 = origen)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  board: number;

  @ApiProperty({ description: 'Índice del punto de bajada' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  alight: number;
}

export class HoldDto {
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

  @ApiProperty({ type: [String], example: ['12', '13'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(6, { each: true })
  seats: string[];
}

export class UpdateHoldDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Asientos que se quitan',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeSeats?: string[];

  @ApiPropertyOptional({ description: 'Extiende el apartado (una sola vez)' })
  @IsOptional()
  @IsBoolean()
  extend?: boolean;
}
