import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MESSAGE = 'La hora debe tener el formato HH:mm (00:00 a 23:59)';

class ScheduleFieldsDto {
  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description: '0 = domingo … 6 = sábado',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un día' })
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[];

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString({ strict: true })
  validFrom: string;

  @ApiPropertyOptional({
    example: '2027-01-31',
    description: 'Vacío = vigencia indefinida',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string | null;

  @ApiPropertyOptional({
    description: 'Andén habitual en la terminal de origen; null = sin andén',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  platformId?: string | null;
}

/** Alta de una o varias salidas con los mismos días y vigencia. */
export class CreateSchedulesDto extends ScheduleFieldsDto {
  @ApiProperty({
    example: ['06:00', '08:30'],
    description: 'Horas de salida en hora local de la terminal de origen',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos una hora de salida' })
  @ArrayMaxSize(48)
  @ArrayUnique({ message: 'Hay horas de salida repetidas' })
  @Matches(HHMM, { each: true, message: HHMM_MESSAGE })
  departureTimes: string[];
}

export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: '07:15' })
  @IsOptional()
  @Matches(HHMM, { message: HHMM_MESSAGE })
  departureTime?: string;

  @ApiPropertyOptional({ example: [0, 6] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un día' })
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  validFrom?: string;

  @ApiPropertyOptional({ example: '2027-01-31' })
  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Andén habitual en la terminal de origen; null = sin andén',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  platformId?: string | null;
}
