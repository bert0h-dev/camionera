import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SearchDeparturesDto {
  @ApiProperty({ description: 'Ciudad donde aborda el pasajero' })
  @IsUUID()
  originCityId: string;

  @ApiProperty({ description: 'Ciudad donde baja' })
  @IsUUID()
  destinationCityId: string;

  @ApiProperty({ example: '2026-11-13', description: 'Fecha de abordaje' })
  @IsDateString({ strict: true })
  date: string;

  @ApiPropertyOptional({ example: '06:00' })
  @IsOptional()
  @Matches(HHMM)
  timeFrom?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(HHMM)
  timeTo?: string;

  @ApiPropertyOptional({ description: 'Solo sin paradas intermedias' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  directOnly?: boolean;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['departure', 'price', 'duration'] })
  @IsOptional()
  @IsIn(['departure', 'price', 'duration'])
  sort?: 'departure' | 'price' | 'duration';
}
