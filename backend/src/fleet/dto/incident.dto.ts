import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  IncidentSeverity,
  IncidentStatus,
} from '../../generated/prisma/enums.js';
import { CreateMaintenanceOrderDto } from './maintenance.dto.js';

type Arg = { value: unknown };
const trim = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() : value;
const optionalText = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() || null : value;

// ---------- Categorías ----------

export class IncidentCategoryDto {
  @ApiProperty({ example: 'Llantas' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    description: 'Pide los datos del siniestro al reportar',
  })
  @IsOptional()
  @IsBoolean()
  isAccident?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateIncidentCategoryDto extends PartialType(
  IncidentCategoryDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Incidencias ----------

export class CreateIncidentDto {
  @ApiProperty()
  @IsUUID()
  busId: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;

  @ApiProperty({ example: 'Se enciende el testigo de temperatura en subida' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ example: 'Km 45 autopista Mazatlán–Culiacán' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiProperty({ example: '2026-10-27T14:30:00-06:00' })
  @IsDateString()
  occurredAt: string;

  @ApiPropertyOptional({ example: 130500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  odometerKm?: number | null;

  @ApiPropertyOptional({ description: 'Solo accidentes: n.º de siniestro' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  claimNumber?: string | null;

  @ApiPropertyOptional({
    description: 'Solo accidentes: aseguradora o ajustador',
  })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  insurer?: string | null;

  @ApiPropertyOptional({ description: 'Solo accidentes: hubo terceros' })
  @IsOptional()
  @IsBoolean()
  thirdParties?: boolean | null;

  @ApiPropertyOptional({ description: 'Solo accidentes: hubo lesionados' })
  @IsOptional()
  @IsBoolean()
  injuries?: boolean | null;
}

/** La unidad no cambia: si se equivocaron, se descarta y se reporta de nuevo. */
export class UpdateIncidentDto extends PartialType(
  OmitType(CreateIncidentDto, ['busId'] as const),
) {}

export class QueryIncidentDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({
    enum: ['open', 'closed'],
    description: 'Abiertas (reportada o en revisión) o cerradas',
  })
  @IsOptional()
  @IsIn(['open', 'closed'])
  state?: 'open' | 'closed';

  @ApiPropertyOptional({ enum: IncidentSeverity })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  busId?: string;
}

export class CloseIncidentDto {
  @ApiProperty({ description: 'Cómo se resolvió o por qué se descarta' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolution: string;
}

/** Orden correctiva desde una incidencia: la unidad y el tipo salen de la incidencia. */
export class IncidentOrderDto extends PartialType(
  PickType(CreateMaintenanceOrderDto, [
    'priority',
    'description',
    'externalShop',
    'mechanicId',
    'tasks',
  ] as const),
) {
  @ApiProperty({ example: '2026-10-28' })
  @IsDateString({ strict: true })
  scheduledDate: string;
}
