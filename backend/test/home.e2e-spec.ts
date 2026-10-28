import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Inicio: pendientes y preferencias (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const stamp = Date.now();
  const userIds: string[] = [];

  const call = (method: 'get' | 'put' | 'post', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });
  const newUser = async (role: string) => {
    const email = `inicio-${role}-${stamp}@camionera.mx`;
    const res = await call('post', '/users', adminToken)
      .send({ email, fullName: `Prueba ${role}`, password: 'secreta123', role })
      .expect(201);
    userIds.push(res.body.id);
    return (await login(email, 'secreta123').expect(200)).body
      .accessToken as string;
  };

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
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ recordId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.securityEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('ordena los pendientes del más urgente al menos', async () => {
    const res = await call('get', '/dashboard/pending', adminToken).expect(200);
    const items: { severity: string; area: string; link: string }[] = res.body;
    const firstSoon = items.findIndex((i) => i.severity === 'soon');
    if (firstSoon >= 0)
      expect(items.slice(firstSoon).every((i) => i.severity === 'soon')).toBe(
        true,
      );
    for (const i of items) expect(i.link.startsWith('/')).toBe(true);
  });

  it('cada rol solo recibe las áreas que puede ver', async () => {
    const hr = await newUser('hr');
    const res = await call('get', '/dashboard/pending', hr).expect(200);
    expect(res.body.every((i: { area: string }) => i.area === 'staff')).toBe(
      true,
    );

    const mechanic = await newUser('mechanic');
    expect(
      (await call('get', '/dashboard/pending', mechanic).expect(200)).body,
    ).toEqual([]);
  });

  it('guarda las secciones ocultas por usuario', async () => {
    const viewer = await newUser('viewer');
    expect(
      (await call('get', '/dashboard/preferences', viewer).expect(200)).body,
    ).toEqual({ hiddenSections: [] });
    await call('put', '/dashboard/preferences', viewer)
      .send({ hiddenSections: ['nada'] })
      .expect(400);
    await call('put', '/dashboard/preferences', viewer)
      .send({ hiddenSections: ['fleet', 'fleet', 'pending'] })
      .expect(200);
    expect(
      (await call('get', '/dashboard/preferences', viewer).expect(200)).body,
    ).toEqual({
      hiddenSections: ['fleet', 'pending'],
    });
  });
});
