import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuditViewerService } from './../src/audit/audit-viewer.service.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Bitácora y eventos de seguridad (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const userIds: string[] = [];
  const stamp = Date.now();
  const email = `bitacora-${stamp}@camionera.mx`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
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
      where: { OR: [{ userId: { in: userIds } }, { email }] },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ recordId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const login = (e: string, password: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: e, password });
  const api = (token: string, url: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);

  it('registra inicios de sesión y permite filtrarlos', async () => {
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        fullName: 'Prueba Bitácora',
        password: 'secreta123',
        role: 'viewer',
      })
      .expect(201);
    userIds.push(created.body.id);

    await login(email, 'incorrecta').expect(401);
    const ok = await login(email, 'secreta123').expect(200);

    const failed = await api(
      adminToken,
      `/audit/security-events?type=login_failed&search=${email}`,
    ).expect(200);
    expect(failed.body.data).toHaveLength(1);
    expect(failed.body.data[0]).toMatchObject({
      userId: created.body.id,
      details: { reason: 'wrong_password' },
    });

    const mine = await api(
      adminToken,
      `/audit/security-events?userId=${created.body.id}`,
    ).expect(200);
    expect(mine.body.data.map((e: { type: string }) => e.type)).toEqual([
      'login_success',
      'login_failed',
    ]);

    // Solo el admin consulta la bitácora
    await api(ok.body.accessToken, '/audit/logs').expect(403);
  });

  it('cambios con filtros, resumen y exportación a CSV', async () => {
    const logs = await api(
      adminToken,
      `/audit/logs?tableName=users&recordId=${userIds[0]}`,
    ).expect(200);
    expect(logs.body.data[0]).toMatchObject({
      tableName: 'users',
      actionType: 'insert',
    });
    expect(logs.body.data[0].user.email).toBe(
      process.env.SEED_ADMIN_EMAIL!.toLowerCase(),
    );

    const filters = await api(adminToken, '/audit/filters').expect(200);
    expect(filters.body.tables.map((t: { name: string }) => t.name)).toContain(
      'users',
    );

    const summary = await api(adminToken, '/audit/summary').expect(200);
    expect(summary.body.failed).toBeGreaterThanOrEqual(1);
    expect(summary.body.retentionDays).toBeGreaterThanOrEqual(30);

    const csv = await api(
      adminToken,
      `/audit/logs/export?recordId=${userIds[0]}`,
    ).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Fecha,Usuario,Correo,Acción,Tabla,Registro');
  });

  it('la depuración borra lo que pasó el periodo de retención', async () => {
    const old = await prisma.securityEvent.create({
      data: {
        type: 'logout',
        email,
        createdAt: new Date('2000-01-01T00:00:00Z'),
      },
    });
    const result = await app.get(AuditViewerService).purge();
    expect(result.events).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.securityEvent.findUnique({ where: { id: old.id } }),
    ).toBeNull();
  });
});
