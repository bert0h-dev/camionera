import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CertificationType } from '../../../generated/prisma/enums.js';

type TransformArg = { value: unknown };
const trim = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim() : value;
// Vacío = sin valor (null borra el dato al editar)
const optionalText = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateCertificationDto {
  @ApiProperty({ enum: CertificationType })
  @IsEnum(CertificationType)
  type: CertificationType;

  @ApiProperty({ example: 'Examen psicofísico integral' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuer?: string | null;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificateNumber?: string | null;

  @ApiProperty({ example: '2026-01-10' })
  @IsDateString({ strict: true })
  issueDate: string;

  @ApiPropertyOptional({
    description: 'Omitir o null si no vence',
    example: '2027-01-10',
  })
  @Transform(optionalText)
  @IsOptional()
  @IsDateString({ strict: true })
  expiryDate?: string | null;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateCertificationDto extends PartialType(
  CreateCertificationDto,
) {}
