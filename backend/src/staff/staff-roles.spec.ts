import { CURP_REGEX, NSS_REGEX, RFC_REGEX } from '../common/validation/mx.js';
import { StaffRole, UserRole } from '../generated/prisma/enums.js';
import { resolveUserRole, SUGGESTED_USER_ROLE } from './staff-roles.js';

describe('resolveUserRole', () => {
  it('cada puesto tiene un rol sugerido', () => {
    for (const role of Object.values(StaffRole) as StaffRole[]) {
      expect(SUGGESTED_USER_ROLE[role]).toBeDefined();
    }
  });

  it('usa el sugerido si no se pide rol', () => {
    expect(resolveUserRole(StaffRole.driver, UserRole.hr)).toBe(
      UserRole.driver,
    );
    expect(resolveUserRole(StaffRole.mechanic, UserRole.hr)).toBe(
      UserRole.viewer,
    );
  });

  it('RRHH no puede asignar un rol distinto al sugerido', () => {
    expect(
      resolveUserRole(StaffRole.driver, UserRole.hr, UserRole.admin),
    ).toBeNull();
    expect(
      resolveUserRole(StaffRole.driver, UserRole.hr, UserRole.driver),
    ).toBe(UserRole.driver);
  });

  it('admin puede asignar cualquier rol', () => {
    expect(
      resolveUserRole(
        StaffRole.admin_staff,
        UserRole.admin,
        UserRole.coordinator,
      ),
    ).toBe(UserRole.coordinator);
  });
});

describe('validadores MX', () => {
  it('CURP', () => {
    expect(CURP_REGEX.test('GODE561231HDFRRN09')).toBe(true);
    expect(CURP_REGEX.test('GODE561331HDFRRN09')).toBe(false); // mes 13
    expect(CURP_REGEX.test('GODE561231HZZRRN09')).toBe(false); // entidad inválida
  });

  it('RFC persona física', () => {
    expect(RFC_REGEX.test('GODE561231GR8')).toBe(true);
    expect(RFC_REGEX.test('GOD561231GR8')).toBe(false); // persona moral (3 letras)
  });

  it('NSS', () => {
    expect(NSS_REGEX.test('12345678901')).toBe(true);
    expect(NSS_REGEX.test('1234567890')).toBe(false);
  });
});
