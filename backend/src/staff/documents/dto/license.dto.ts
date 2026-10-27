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
import { LicenseType } from '../../../generated/prisma/enums.js';

type TransformArg = { value: unknown };
const upper = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim() : value;
const optionalText = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateLicenseDto {
  @ApiProperty({ enum: LicenseType })
  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @ApiProperty()
  @Transform(upper)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  licenseNumber: string;

  @ApiProperty({ example: 'SICT' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  issuer: string;

  @ApiProperty({ example: '2024-03-01' })
  @IsDateString({ strict: true })
  issueDate: string;

  @ApiProperty({ example: '2028-03-01' })
  @IsDateString({ strict: true })
  expiryDate: string;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateLicenseDto extends PartialType(CreateLicenseDto) {}
