import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class TerminateStaffDto {
  @ApiProperty({ example: '2026-10-31' })
  @IsDateString({ strict: true })
  terminationDate: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  terminationReason: string;
}
