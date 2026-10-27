import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CURP_REGEX, NSS_REGEX, PHONE_REGEX, RFC_REGEX } from '../../common/validation/mx.js';
import { StaffRole } from '../../generated/prisma/enums.js';

type TransformArg = { value: unknown };
const trim = ({ value }: TransformArg) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;
const digits = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.replace(/\D/g, '') || undefined : value;
const optionalText = ({ value }: TransformArg) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateStaffDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ description: 'Apellido paterno' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ description: 'Apellido materno' })
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondLastName?: string;

  @ApiPropertyOptional({ example: 'GODE561231HDFRRN09' })
  @Transform(upper)
  @IsOptional()
  @Matches(CURP_REGEX, { message: 'CURP con formato inválido' })
  curp?: string;

  @ApiPropertyOptional({ example: 'GODE561231GR8' })
  @Transform(upper)
  @IsOptional()
  @Matches(RFC_REGEX, { message: 'RFC con formato inválido' })
  rfc?: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @Transform(digits)
  @IsOptional()
  @Matches(NSS_REGEX, { message: 'El NSS debe tener 11 dígitos' })
  nss?: string;

  @ApiProperty({ example: '1990-05-20' })
  @IsDateString({ strict: true })
  birthDate: string;

  @ApiPropertyOptional()
  @Transform(({ value }: TransformArg) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '5512345678' })
  @Transform(digits)
  @Matches(PHONE_REGEX, { message: 'El teléfono debe tener 10 dígitos' })
  phone: string;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  emergencyContact?: string;

  @ApiPropertyOptional()
  @Transform(digits)
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'El teléfono de emergencia debe tener 10 dígitos' })
  emergencyPhone?: string;

  @ApiProperty({ enum: StaffRole })
  @IsEnum(StaffRole)
  role: StaffRole;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString({ strict: true })
  hireDate: string;
}
