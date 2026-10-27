import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { StaffRole, ShiftType } from '../../../generated/prisma/enums.js';
import { TIME_REGEX } from './shift-template.dto.js';

const optionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** Horario de un turno: plantilla, horas propias o día de descanso. */
class ScheduleShiftDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRestDay?: boolean;

  @ApiPropertyOptional({
    description: 'Toma horario, tipo y descanso de la plantilla',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ example: '06:00' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'Hora de inicio inválida (HH:mm)' })
  startTime?: string;

  @ApiPropertyOptional({
    example: '14:00',
    description: 'Si es menor o igual al inicio, termina al día siguiente',
  })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'Hora de fin inválida (HH:mm)' })
  endTime?: string;

  @ApiPropertyOptional({ enum: ShiftType })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Solo admin: guardar aunque rompa las reglas de horas',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ description: 'Obligatorio si force = true' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MinLength(5)
  overrideReason?: string | null;
}

export class CreateScheduleDto extends ScheduleShiftDto {
  @ApiProperty()
  @IsUUID()
  staffId: string;

  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  scheduleDate: string;
}

export class UpdateScheduleDto extends ScheduleShiftDto {}

export class BulkScheduleDto extends OmitType(ScheduleShiftDto, [
  'force',
  'overrideReason',
] as const) {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  staffIds: string[];

  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  from: string;

  @ApiProperty({ example: '2026-11-08' })
  @IsDateString({ strict: true })
  to: string;

  @ApiProperty({
    description: '0 = domingo … 6 = sábado',
    example: [1, 2, 3, 4, 5],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays: number[];

  @ApiPropertyOptional({
    default: false,
    description: 'Reemplazar turnos existentes en esos días',
  })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

export class QuerySchedulesDto {
  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  from: string;

  @ApiProperty({ example: '2026-11-08' })
  @IsDateString({ strict: true })
  to: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;
}

export const MAX_RANGE_DAYS = 62;
