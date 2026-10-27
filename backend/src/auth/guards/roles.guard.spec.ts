import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

const contextFor = (user?: { role: UserRole }) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => vi.restoreAllMocks());

  it('permite rutas sin @Roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ role: UserRole.viewer }))).toBe(true);
  });

  it('permite al rol indicado', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.hr]);
    expect(guard.canActivate(contextFor({ role: UserRole.hr }))).toBe(true);
  });

  it('admin siempre tiene acceso', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.hr]);
    expect(guard.canActivate(contextFor({ role: UserRole.admin }))).toBe(true);
  });

  it('rechaza otros roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.hr]);
    expect(() => guard.canActivate(contextFor({ role: UserRole.vendor }))).toThrow(
      ForbiddenException,
    );
  });
});
