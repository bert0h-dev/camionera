import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';

/** Secciones de Inicio que el usuario puede ocultar. */
export const HOME_SECTIONS = [
  'pending',
  'me',
  'staff',
  'fleet',
  'trips',
  'myOrders',
] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export class HomePreferencesDto {
  @ApiProperty({ enum: HOME_SECTIONS, isArray: true, example: ['fleet'] })
  @IsArray()
  @ArrayMaxSize(HOME_SECTIONS.length)
  @IsIn(HOME_SECTIONS, { each: true })
  hiddenSections: HomeSection[];
}
