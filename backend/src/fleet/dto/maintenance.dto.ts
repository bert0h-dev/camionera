import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
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
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceType,
} from '../../generated/prisma/enums.js';

type Arg = { value: unknown };
const trim = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() : value;
const optionalText = ({ value }: Arg) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateMaintenanceOrderDto {
  @ApiProperty()
  @IsUUID()
  busId: string;

  @ApiProperty({ enum: MaintenanceType })
  @IsEnum(MaintenanceType)
  type: MaintenanceType;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiProperty({ example: 'Servicio de 15,000 km' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description: string;

  @ApiProperty({ example: '2026-11-03' })
  @IsDateString({ strict: true })
  scheduledDate: string;

  @ApiPropertyOptional({
    description: 'Nombre del taller externo; vacío = taller interno',
  })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  externalShop?: string | null;

  @ApiPropertyOptional({ description: 'Usuario con rol mecánico' })
  @IsOptional()
  @IsUUID()
  mechanicId?: string | null;

  @ApiPropertyOptional({
    description: 'Tareas; en preventivos, vacío = las del catálogo',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  tasks?: string[];
}

export class UpdateMaintenanceOrderDto extends PartialType(
  PickType(CreateMaintenanceOrderDto, [
    'priority',
    'description',
    'scheduledDate',
    'externalShop',
    'mechanicId',
  ] as const),
) {}

export class QueryMaintenanceDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MaintenanceStatus })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ enum: MaintenanceType })
  @IsOptional()
  @IsEnum(MaintenanceType)
  type?: MaintenanceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  busId?: string;
}

export class StartOrderDto {
  @ApiProperty({ example: 130500, description: 'Odómetro al entrar al taller' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  km: number;
}

export class CompleteOrderDto {
  @ApiProperty({ example: 130520, description: 'Odómetro al salir del taller' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  km: number;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  workPerformed: string;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  laborCost?: number;

  @ApiPropertyOptional({ example: 3200.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  partsCost?: number;
}

export class CancelOrderDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ToggleTaskDto {
  @ApiProperty()
  @IsBoolean()
  isDone: boolean;
}

export class AddTaskDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description: string;
}

export class TaskTemplateDto {
  @ApiProperty({ example: 'Cambio de aceite y filtro' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateTaskTemplateDto extends PartialType(TaskTemplateDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
