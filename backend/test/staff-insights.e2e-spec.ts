import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Requiere la BD de .env y el admin creado con `npx prisma db seed`
describe('Staff insights (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let staffId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL,
        password: process.env.SEED_ADMIN_PASSWORD,
      })
      .expect(200);
    token = res.body.accessToken;

    const staff = await api('post', '/staff')
      .send({
        firstName: 'Ficha',
        lastName: 'InsightsE2E',
        birthDate: '1985-06-15',
        phone: '5500000005',
        role: 'driver',
        hireDate: '2020-01-01',
      })
      .expect(201);
    staffId = staff.body.id;
  });

  afterAll(async () => {
    await prisma.staff.deleteMany({ where: { id: staffId } });
    await prisma.auditLog.deleteMany({ where: { recordId: staffId } });
    await app.close();
  });

  const api = (method: 'get' | 'post', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  it('cifras de la banda de Empleados', async () => {
    const res = await api('get', '/staff/stats').expect(200);
    expect(res.body).toMatchObject({
      active: expect.any(Number),
      withExpiredDocs: expect.any(Number),
      withoutAccess: expect.any(Number),
    });
  });

  it('la lista con insights agrega documentos y situación de hoy', async () => {
    const res = await api(
      'get',
      '/staff?insights=true&search=InsightsE2E',
    ).expect(200);
    const row = res.body.data.find((s: { id: string }) => s.id === staffId);
    expect(row.documents).toBeNull();
    expect(row.today.state).toBe('none');

    const plain = await api('get', '/staff?search=InsightsE2E').expect(200);
    expect(plain.body.data[0].today).toBeUndefined();
  });

  it('resumen de la ficha: un conductor sin licencia la requiere', async () => {
    const res = await api('get', `/staff/${staffId}/summary`).expect(200);
    expect(res.body.license).toBeNull();
    expect(res.body.requiresLicense).toBe(true);
    expect(res.body.week).toMatchObject({ hours: 0, max: expect.any(Number) });
  });
});
