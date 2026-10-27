import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ShiftType } from '../../../generated/prisma/enums.js';

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftTemplateDto {
  @ApiProperty({ example: 'Matutino' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ShiftType })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiProperty({ example: '06:00' })
  @Matches(TIME_REGEX, { message: 'Hora de inicio inválida (HH:mm)' })
  startTime: string;

  @ApiProperty({ example: '14:00' })
  @Matches(TIME_REGEX, { message: 'Hora de fin inválida (HH:mm)' })
  endTime: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;
}

export class UpdateShiftTemplateDto extends PartialType(
  CreateShiftTemplateDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
