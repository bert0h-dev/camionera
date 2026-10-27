import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a los roles indicados. `admin` siempre tiene acceso. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
