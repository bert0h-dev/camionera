import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  EvaluationStatus,
  StaffRole,
} from '../../../generated/prisma/enums.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

// ---------- Criterios ----------

export class CreateCriterionDto {
  @ApiProperty({ example: 'Trato al pasajero' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  weight?: number;

  @ApiPropertyOptional({
    enum: StaffRole,
    isArray: true,
    description: 'Vacío = todos los puestos',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(StaffRole, { each: true })
  appliesTo?: StaffRole[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCriterionDto extends PartialType(CreateCriterionDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Evaluaciones ----------

export class CreateEvaluationDto {
  @ApiProperty()
  @IsUUID()
  staffId: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString({ strict: true })
  periodStart: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString({ strict: true })
  periodEnd: string;
}

export class ScoreDto {
  @ApiProperty()
  @IsUUID()
  criterionId: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1, { message: 'La calificación va de 1 a 5' })
  @Max(5, { message: 'La calificación va de 1 a 5' })
  score?: number | null;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  comment?: string | null;
}

export class UpdateEvaluationDto {
  @ApiPropertyOptional({ type: [ScoreDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreDto)
  scores?: ScoreDto[];

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  strengths?: string | null;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  improvements?: string | null;

  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  comments?: string | null;
}

export class AcknowledgeEvaluationDto {
  @ApiPropertyOptional()
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  employeeComment?: string | null;
}

export class QueryEvaluationsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({ enum: EvaluationStatus })
  @IsOptional()
  @IsEnum(EvaluationStatus)
  status?: EvaluationStatus;

  @ApiPropertyOptional({
    description: 'Periodos que terminan desde esta fecha',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Periodos que inician hasta esta fecha' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
