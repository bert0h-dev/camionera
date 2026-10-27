import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const KEYS = [
  'company.trade_name',
  'company.rfc',
  'taxes.vat_rate',
  'commissions.vendor_percent',
];

describe('Configuración general (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let before: Record<string, unknown>;
  const userIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    adminToken = await login(
      process.env.SEED_ADMIN_EMAIL!,
      process.env.SEED_ADMIN_PASSWORD!,
    );
    const company = await api(adminToken, 'get', '/settings/company').expect(
      200,
    );
    before = Object.fromEntries(KEYS.map((k) => [k, company.body[k]]));
  });

  afterAll(async () => {
    await api(adminToken, 'patch', '/settings')
      .send({ values: before })
      .expect(200);
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function login(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  const api = (token: string, method: 'get' | 'patch', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  it('guarda una sección completa o nada si un valor es inválido', async () => {
    const bad = await api(adminToken, 'patch', '/settings')
      .send({
        values: {
          'company.trade_name': 'Terminal E2E',
          'company.rfc': 'INVALIDO',
        },
      })
      .expect(400);
    expect(String(bad.body.message)).toContain('RFC');
    let company = await api(adminToken, 'get', '/settings/company').expect(200);
    expect(company.body['company.trade_name']).toBe(
      before['company.trade_name'],
    );

    await api(adminToken, 'patch', '/settings')
      .send({
        values: {
          'company.trade_name': 'Terminal E2E',
          'company.rfc': 'tea010101ab1'.toUpperCase(),
          'taxes.vat_rate': 8,
          'commissions.vendor_percent': 2.5,
        },
      })
      .expect(200);
    company = await api(adminToken, 'get', '/settings/company').expect(200);
    expect(company.body).toMatchObject({
      'company.trade_name': 'Terminal E2E',
      'company.rfc': 'TEA010101AB1',
      'taxes.vat_rate': 8,
      'commissions.vendor_percent': 2.5,
    });
  });

  it('cualquier usuario con sesión lee los datos de la empresa, pero solo el admin los cambia', async () => {
    const email = `config-${Date.now()}@camionera.mx`;
    const user = await api(adminToken, 'patch', '/settings')
      .send({ values: {} })
      .expect(200);
    expect(user.body).toEqual([]);
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        fullName: 'Visor Config',
        password: 'secreta123',
        role: 'viewer',
      })
      .expect(201);
    userIds.push(created.body.id);
    const token = await login(email, 'secreta123');

    const company = await api(token, 'get', '/settings/company').expect(200);
    expect(company.body).toHaveProperty('taxes.vat_rate');
    expect(company.body).not.toHaveProperty('security.max_failed_logins');
    await api(token, 'patch', '/settings')
      .send({ values: { 'taxes.vat_rate': 0 } })
      .expect(403);
  });
});
