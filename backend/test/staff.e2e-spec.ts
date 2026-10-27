import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// CURP con formato válido y sufijo aleatorio para no chocar entre corridas
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';
const randomCurp = () => {
  const pick = () => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
  return `PEJU900101HDF${pick()}${pick()}${pick()}A${Math.floor(Math.random() * 10)}`;
};

// Requiere la BD de .env y el admin creado con `npm run prisma:seed`
describe('Staff (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const createdStaff: string[] = [];
  const testEmail = `e2e-${Date.now()}@camionera.mx`;

  const base = () => ({
    firstName: 'Juan',
    lastName: 'Pérez',
    secondLastName: 'López',
    curp: randomCurp(),
    birthDate: '1990-01-01',
    phone: '55 1234 5678',
    role: 'driver',
    hireDate: '2026-01-15',
  });

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

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    const staff = await prisma.staff.findMany({ where: { id: { in: createdStaff } } });
    const userIds = staff.map((s) => s.userId).filter((id): id is string => !!id);
    await prisma.staff.deleteMany({ where: { id: { in: createdStaff } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { recordId: { in: [...createdStaff, ...userIds] } } });
    await app.close();
  });

  const post = (url: string, body: object) =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);

  it('crea empleados con número consecutivo y normaliza datos', async () => {
    const a = await post('/staff', base()).expect(201);
    const b = await post('/staff', base()).expect(201);
    createdStaff.push(a.body.id, b.body.id);

    expect(a.body.employeeNumber).toMatch(/^EMP-\d{6}$/);
    const n = (r: request.Response) => Number(r.body.employeeNumber.slice(4));
    expect(n(b)).toBe(n(a) + 1);
    expect(a.body.phone).toBe('5512345678');
    expect(a.body.status).toBe('active');
  });

  it('rechaza CURP duplicada con 409', async () => {
    const data = base();
    const first = await post('/staff', data).expect(201);
    createdStaff.push(first.body.id);
    await post('/staff', data).expect(409);
  });

  it('valida formato y edad mínima con mensajes en español', async () => {
    const invalid = await post('/staff', { ...base(), curp: 'XXX', phone: '123' }).expect(400);
    expect(invalid.body.message).toEqual(
      expect.arrayContaining(['CURP con formato inválido', 'El teléfono debe tener 10 dígitos']),
    );

    const minor = await post('/staff', { ...base(), birthDate: '2010-01-01' }).expect(400);
    expect(minor.body.message).toMatch(/18 años/);
  });

  it('dar acceso permite iniciar sesión y la baja lo revoca', async () => {
    const staff = await post('/staff', base()).expect(201);
    createdStaff.push(staff.body.id);

    const granted = await post(`/staff/${staff.body.id}/credentials`, {
      email: testEmail,
      password: 'secreta123',
    }).expect(201);
    expect(granted.body.user.role).toBe('driver');
    expect(granted.body.user.email).toBe(testEmail);

    await post(`/staff/${staff.body.id}/credentials`, {
      email: `otro-${testEmail}`,
      password: 'secreta123',
    }).expect(409);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'secreta123' })
      .expect(200);

    const terminated = await post(`/staff/${staff.body.id}/terminate`, {
      terminationDate: '2026-10-31',
      terminationReason: 'Renuncia voluntaria',
    }).expect(201);
    expect(terminated.body.status).toBe('inactive');
    expect(terminated.body.user.isActive).toBe(false);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'secreta123' })
      .expect(401);
  });
});
