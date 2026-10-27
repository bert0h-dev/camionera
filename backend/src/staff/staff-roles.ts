import { StaffRole, UserRole } from '../generated/prisma/enums.js';

/** Rol de sistema que se sugiere (y que RRHH puede asignar) según el puesto. */
export const SUGGESTED_USER_ROLE: Record<StaffRole, UserRole> = {
  [StaffRole.driver]: UserRole.driver,
  [StaffRole.collector]: UserRole.collector,
  [StaffRole.vendor]: UserRole.vendor,
  [StaffRole.supervisor]: UserRole.supervisor,
  [StaffRole.hr]: UserRole.hr,
  [StaffRole.mechanic]: UserRole.viewer,
  [StaffRole.admin_staff]: UserRole.viewer,
};

/** Solo admin puede asignar un rol distinto al sugerido. */
export function resolveUserRole(
  staffRole: StaffRole,
  actorRole: UserRole,
  requested?: UserRole,
): UserRole | null {
  const suggested = SUGGESTED_USER_ROLE[staffRole];
  if (!requested || requested === suggested) return suggested;
  return actorRole === UserRole.admin ? requested : null;
}
