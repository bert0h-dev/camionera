import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AttendanceStatus,
  StaffRole,
} from '../../../generated/prisma/enums.js';
import { TIME_REGEX } from '../../schedules/dto/shift-template.dto.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** Horas locales "HH:mm"; la salida menor o igual a la entrada = día siguiente. */
class AttendanceTimesDto {
  @ApiPropertyOptional({
    example: '06:05',
    description: 'null borra la entrada',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(TIME_REGEX, { message: 'Hora de entrada inválida (HH:mm)' })
  checkInTime?: string | null;

  @ApiPropertyOptional({
    example: '14:10',
    description: 'null borra la salida',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(TIME_REGEX, { message: 'Hora de salida inválida (HH:mm)' })
  checkOutTime?: string | null;

  @ApiPropertyOptional({
    description: 'Falta justificada (permiso, vacaciones, incapacidad)',
  })
  @IsOptional()
  @IsBoolean()
  excused?: boolean;
}

export class CreateAttendanceDto extends AttendanceTimesDto {
  @ApiProperty()
  @IsUUID()
  staffId: string;

  @ApiProperty({ example: '2026-11-02', description: 'Día del turno' })
  @IsDateString({ strict: true })
  date: string;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateAttendanceDto extends AttendanceTimesDto {
  @ApiProperty({ description: 'Motivo de la corrección (obligatorio)' })
  @Transform(trimOrNull)
  @IsString({ message: 'Indica el motivo de la corrección' })
  @MinLength(3, { message: 'Indica el motivo de la corrección' })
  notes: string;
}

export class QueryAttendanceDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsDateString({ strict: true })
  from: string;

  @ApiProperty({ example: '2026-11-30' })
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

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}

export class AttendanceDayDto {
  @ApiProperty({ example: '2026-11-02' })
  @IsDateString({ strict: true })
  date: string;

  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;
}
