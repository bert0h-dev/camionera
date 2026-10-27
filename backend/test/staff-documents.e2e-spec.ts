import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { addDays, today } from './../src/common/dates.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const day = (offset: number) => addDays(today(), offset).toISOString().slice(0, 10);

// Requiere la BD de .env y el admin creado con `npm run prisma:seed`
describe('Staff documents (e2e)', () => {
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

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
    token = login.body.accessToken;

    const staff = await api('post', '/staff', {
      firstName: 'Docs',
      lastName: 'E2E',
      birthDate: '1985-06-15',
      phone: '5500000000',
      role: 'driver',
      hireDate: '2020-01-01',
    }).expect(201);
    staffId = staff.body.id;
  });

  afterAll(async () => {
    const ids = [
      staffId,
      ...(await prisma.staffLicense.findMany({ where: { staffId } })).map((d) => d.id),
      ...(await prisma.staffCertification.findMany({ where: { staffId } })).map((d) => d.id),
    ];
    await prisma.staff.delete({ where: { id: staffId } }); // licencias y certificaciones en cascada
    await prisma.auditLog.deleteMany({ where: { recordId: { in: ids } } });
    await app.close();
  });

  function api(method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) {
    const req = request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }

  it('licencia: alta con estado calculado, edición y validación de fechas', async () => {
    const created = await api('post', `/staff/${staffId}/licenses`, {
      licenseType: 'A',
      licenseNumber: 'lfa-123',
      issuer: 'SICT',
      issueDate: day(-700),
      expiryDate: day(10),
    }).expect(201);
    expect(created.body.licenseNumber).toBe('LFA-123');
    expect(created.body.status).toBe('expiring');
    expect(created.body.daysToExpiry).toBe(10);

    const bad = await api('patch', `/staff/licenses/${created.body.id}`, { expiryDate: day(-800) }).expect(400);
    expect(bad.body.message).toMatch(/posterior/);

    await api('post', `/staff/${staffId}/licenses`, {
      licenseType: 'A',
      licenseNumber: 'LFA-123',
      issuer: 'SICT',
      issueDate: day(-10),
      expiryDate: day(1000),
    }).expect(409);
  });

  it('cumplimiento del conductor: requiere licencia A y examen médico vigentes', async () => {
    const before = await api('get', `/staff/${staffId}/compliance`).expect(200);
    expect(before.body).toEqual({ compliant: false, missing: ['Examen médico vigente'] });

    await api('post', `/staff/${staffId}/certifications`, {
      type: 'medical_exam',
      name: 'Examen psicofísico integral',
      issueDate: day(-30),
      expiryDate: day(-1),
    }).expect(201);
    expect((await api('get', `/staff/${staffId}/compliance`)).body.compliant).toBe(false);

    await api('post', `/staff/${staffId}/certifications`, {
      type: 'medical_exam',
      name: 'Examen psicofísico integral',
      issueDate: day(0),
      expiryDate: day(365),
      certificateNumber: '',
    }).expect(201);
    expect((await api('get', `/staff/${staffId}/compliance`)).body).toEqual({ compliant: true, missing: [] });
  });

  it('vencimientos: incluye por vencer y omite documentos ya renovados', async () => {
    const res = await api('get', '/staff/expirations').expect(200);
    const mine = res.body.items.filter((i: { staff: { id: string } }) => i.staff.id === staffId);

    // La licencia vence en 10 días; el examen vencido ya se renovó y no debe aparecer
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'license', status: 'expiring', daysToExpiry: 10 });
    expect(res.body.alertDays).toBeGreaterThan(0);

    const narrow = await api('get', '/staff/expirations?days=5').expect(200);
    expect(narrow.body.items.some((i: { staff: { id: string } }) => i.staff.id === staffId)).toBe(false);
  });

  it('eliminar certificación', async () => {
    const list = await api('get', `/staff/${staffId}/certifications`).expect(200);
    await api('delete', `/staff/certifications/${list.body[0].id}`).expect(204);
    expect((await api('get', `/staff/${staffId}/certifications`)).body).toHaveLength(list.body.length - 1);
  });
});
