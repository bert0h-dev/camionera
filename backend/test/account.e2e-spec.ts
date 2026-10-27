import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Requiere la BD de .env y el admin creado con `npx prisma db seed`
describe('Cuentas y seguridad (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const userIds: string[] = [];
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    adminToken = (
      await login(
        process.env.SEED_ADMIN_EMAIL!,
        process.env.SEED_ADMIN_PASSWORD!,
      ).expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await prisma.securityEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ recordId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  const auth =
    (token: string) =>
    (method: 'get' | 'post' | 'delete' | 'patch', url: string) =>
      request(app.getHttpServer())
        [method](url)
        .set('Authorization', `Bearer ${token}`);

  async function newUser(name: string) {
    const email = `cuenta-${name}-${stamp}@camionera.mx`;
    const res = await auth(adminToken)('post', '/users')
      .send({
        email,
        fullName: `Prueba ${name}`,
        password: 'secreta123',
        role: 'viewer',
      })
      .expect(201);
    userIds.push(res.body.id);
    return { id: res.body.id as string, email };
  }

  it('bloquea tras los intentos fallidos y el admin puede desbloquear', async () => {
    const u = await newUser('bloqueo');
    for (let i = 0; i < 4; i++) {
      const r = await login(u.email, 'incorrecta').expect(401);
      expect(r.body.message).toBe('Credenciales inválidas');
    }
    const locked = await login(u.email, 'incorrecta').expect(401);
    expect(locked.body.message).toContain('bloqueada');
    // Ni con la contraseña correcta mientras dure el bloqueo
    await login(u.email, 'secreta123').expect(401);

    await auth(adminToken)('post', `/users/${u.id}/unlock`).expect(204);
    await login(u.email, 'secreta123').expect(200);
  });

  it('contraseña temporal del admin obliga a cambiarla; cambiarla limpia la marca', async () => {
    const u = await newUser('temporal');
    await auth(adminToken)('patch', `/users/${u.id}/password`)
      .send({ password: 'temporal123' })
      .expect(204);
    const res = await login(u.email, 'temporal123').expect(200);
    expect(res.body.user.mustChangePassword).toBe(true);

    const token = res.body.accessToken as string;
    await auth(token)('post', '/auth/change-password')
      .send({ currentPassword: 'temporal123', newPassword: 'temporal123' })
      .expect(400);
    await auth(token)('post', '/auth/change-password')
      .send({ currentPassword: 'temporal123', newPassword: 'definitiva123' })
      .expect(204);
    const me = await auth(token)('get', '/auth/me').expect(200);
    expect(me.body.mustChangePassword).toBe(false);
  });

  it('sesiones: lista con la actual marcada y cierre de las demás', async () => {
    const u = await newUser('sesiones');
    const first = await login(u.email, 'secreta123').expect(200);
    await login(u.email, 'secreta123').expect(200); // otro dispositivo
    const cookie = first.headers['set-cookie'] as unknown as string[];
    const token = first.body.accessToken as string;

    const list = await auth(token)('get', '/auth/sessions')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(
      list.body.filter((s: { current: boolean }) => s.current),
    ).toHaveLength(1);

    await auth(token)('post', '/auth/sessions/revoke-others')
      .set('Cookie', cookie)
      .expect(204);
    const after = await auth(token)('get', '/auth/sessions')
      .set('Cookie', cookie)
      .expect(200);
    expect(after.body).toHaveLength(1);
    expect(after.body[0].current).toBe(true);

    // El admin ve y cierra las sesiones de cualquier usuario
    const detail = await auth(adminToken)(
      'get',
      `/users/${u.id}/detail`,
    ).expect(200);
    expect(detail.body.sessions).toHaveLength(1);
    await auth(adminToken)('post', `/users/${u.id}/revoke-sessions`).expect(
      204,
    );
    expect(
      (await auth(adminToken)('get', `/users/${u.id}/detail`).expect(200)).body
        .sessions,
    ).toHaveLength(0);
  });

  it('recuperación por correo: responde igual exista o no la cuenta y el enlace es de un solo uso', async () => {
    const u = await newUser('recuperar');
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'nadie@camionera.mx' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: u.email })
      .expect(204);
    expect(await prisma.passwordReset.count({ where: { userId: u.id } })).toBe(
      1,
    );

    // El token real solo viaja por correo: se crea uno conocido para la prueba
    const token = `token-de-prueba-${stamp}-abcdefghijklmnop`;
    await prisma.passwordReset.create({
      data: {
        userId: u.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'recuperada123' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'otra-vez-123' })
      .expect(400);
    await login(u.email, 'recuperada123').expect(200);
  });

  it('dos renovaciones casi simultáneas con la misma cookie no cierran la sesión; fuera del margen sí', async () => {
    const u = await newUser('concurrente');
    const first = await login(u.email, 'secreta123').expect(200);
    const cookie = first.headers['set-cookie'] as unknown as string[];
    const refresh = () =>
      request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie);

    // Pestaña A y pestaña B renuevan con la misma cookie
    await refresh().expect(200);
    await refresh().expect(200);
    expect(
      await prisma.securityEvent.count({
        where: { userId: u.id, type: 'token_reuse' },
      }),
    ).toBe(0);

    // La misma cookie reaparece minutos después: se trata como robo y se cierran todas
    await prisma.refreshToken.updateMany({
      where: { userId: u.id, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 5 * 60_000) },
    });
    await refresh().expect(401);
    expect(
      await prisma.securityEvent.count({
        where: { userId: u.id, type: 'token_reuse' },
      }),
    ).toBe(1);
    expect(
      await prisma.refreshToken.count({
        where: { userId: u.id, revokedAt: null },
      }),
    ).toBe(0);
  });
});
