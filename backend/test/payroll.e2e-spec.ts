import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Usa una semana de 2030 para no chocar con periodos reales ni con la demo.
const START = '2030-01-07'; // lunes
const END = '2030-01-13'; // domingo

describe('Payroll (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const staffIds: string[] = [];
  const periodIds: string[] = [];
  const stamp = Date.now();

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
  });

  afterAll(async () => {
    const staff = await prisma.staff.findMany({
      where: { id: { in: staffIds } },
    });
    const userIds = staff
      .map((s) => s.userId)
      .filter((id): id is string => !!id);
    await prisma.payrollPeriod.deleteMany({ where: { id: { in: periodIds } } });
    await prisma.staff.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { recordId: { in: [...staffIds, ...periodIds, ...userIds] } },
          { userId: { in: userIds } },
        ],
      },
    });
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

  function api(
    token: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    url: string,
    body?: object,
  ) {
    const req = request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }

  async function newStaff(name: string, role: string, withUser = false) {
    const staff = await api(adminToken, 'post', '/staff', {
      firstName: name,
      lastName: 'NominaE2E',
      birthDate: '1985-06-15',
      phone: '5500000006',
      role,
      hireDate: '2020-01-01',
    }).expect(201);
    staffIds.push(staff.body.id);
    if (!withUser) return { id: staff.body.id as string, token: '' };
    const email = `nom-${name.toLowerCase()}-${stamp}@camionera.mx`;
    await api(adminToken, 'post', `/staff/${staff.body.id}/credentials`, {
      email,
      password: 'secreta123',
    }).expect(201);
    return {
      id: staff.body.id as string,
      token: await login(email, 'secreta123'),
    };
  }

  it('flujo completo: salario, generar, ajustar, regenerar, cerrar, exportar y recibo', async () => {
    const driver = await newStaff('Chofer', 'driver', true);
    const supervisor = await newStaff('Super', 'supervisor', true);

    await api(adminToken, 'post', `/staff/${driver.id}/compensation`, {
      paymentType: 'daily',
      baseSalary: 400,
      paymentFrequency: 'weekly',
      effectiveFrom: '2029-12-01',
    }).expect(201);

    // Una falta el martes y 10 h extra el lunes (9 dobles + 1 triple); domingo trabajado
    await prisma.staffAttendance.createMany({
      data: [
        {
          staffId: driver.id,
          attendanceDate: new Date(`${START}T00:00:00Z`),
          status: 'present',
          source: 'manual',
          overtimeMinutes: 600,
        },
        {
          staffId: driver.id,
          attendanceDate: new Date('2030-01-08T00:00:00Z'),
          status: 'absent',
          source: 'system',
        },
        {
          staffId: driver.id,
          attendanceDate: new Date(`${END}T00:00:00Z`),
          status: 'present',
          source: 'manual',
        },
      ],
    });

    const period = await api(adminToken, 'post', '/payroll/periods', {
      frequency: 'weekly',
      periodStart: START,
      periodEnd: END,
    }).expect(201);
    periodIds.push(period.body.id);
    const id = period.body.id as string;

    // Traslape
    await api(adminToken, 'post', '/payroll/periods', {
      frequency: 'weekly',
      periodStart: END,
      periodEnd: '2030-01-19',
    }).expect(409);
    // No se cierra sin generar
    await api(adminToken, 'post', `/payroll/periods/${id}/close`).expect(400);

    const gen = await api(
      adminToken,
      'post',
      `/payroll/periods/${id}/generate`,
    ).expect(201);
    const entry = gen.body.entries.find(
      (e: { staffId: string }) => e.staffId === driver.id,
    );
    expect(Number(entry.payableDays)).toBe(6);
    expect(Number(entry.salaryAmount)).toBe(2400);
    expect(Number(entry.overtimeAmount)).toBe(9 * 100 + 150);
    expect(Number(entry.sundayPremium)).toBe(100);
    expect(Number(entry.netPay)).toBe(3550);
    // El supervisor no tiene salario: aparece como aviso y no como línea
    expect(gen.body.missingSalary.map((s: { id: string }) => s.id)).toContain(
      supervisor.id,
    );

    // Ajuste y regeneración sin perderlo
    await api(adminToken, 'post', `/payroll/entries/${entry.id}/adjustments`, {
      type: 'deduction',
      concept: 'Préstamo',
      amount: 550,
    }).expect(201);
    const regen = await api(
      adminToken,
      'post',
      `/payroll/periods/${id}/generate`,
    ).expect(201);
    const after = regen.body.entries.find(
      (e: { staffId: string }) => e.staffId === driver.id,
    );
    expect(after.adjustments).toHaveLength(1);
    expect(Number(after.netPay)).toBe(3000);

    // El supervisor (rol) no ve nómina
    await api(supervisor.token, 'get', '/payroll/periods').expect(403);
    // El empleado no ve borradores
    expect(
      (await api(driver.token, 'get', '/payroll/me').expect(200)).body,
    ).toHaveLength(0);

    await api(adminToken, 'post', `/payroll/periods/${id}/close`).expect(201);
    await api(adminToken, 'post', `/payroll/periods/${id}/generate`).expect(
      400,
    );
    await api(adminToken, 'post', `/payroll/entries/${entry.id}/adjustments`, {
      type: 'perception',
      concept: 'Bono',
      amount: 100,
    }).expect(400);

    const csv = await api(
      adminToken,
      'get',
      `/payroll/periods/${id}/export?format=csv`,
    ).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Neto a pagar');
    const xlsx = await api(
      adminToken,
      'get',
      `/payroll/periods/${id}/export?format=xlsx`,
    ).expect(200);
    expect(xlsx.headers['content-disposition']).toContain('.xlsx');

    const mine = await api(driver.token, 'get', '/payroll/me').expect(200);
    expect(mine.body).toHaveLength(1);
    expect(Number(mine.body[0].netPay)).toBe(3000);

    await api(adminToken, 'post', `/payroll/periods/${id}/pay`).expect(201);
  });

  it('configuración de retardos editable por RRHH', async () => {
    const before = await api(adminToken, 'get', '/payroll/settings').expect(
      200,
    );
    await api(adminToken, 'patch', '/payroll/settings', {
      latesPerAbsence: 0,
    }).expect(400);
    const updated = await api(adminToken, 'patch', '/payroll/settings', {
      latePenaltyEnabled: true,
      latesPerAbsence: 4,
    }).expect(200);
    expect(updated.body).toEqual({
      latePenaltyEnabled: true,
      latesPerAbsence: 4,
    });
    await api(adminToken, 'patch', '/payroll/settings', before.body).expect(
      200,
    );
  });
});
