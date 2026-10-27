import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Semana fija lejana para no chocar con datos reales: lunes 2030-03-04 a domingo 2030-03-10
const MON = '2030-03-04';

// Requiere la BD de .env y el admin creado con `npm run prisma:seed`
describe('Schedules (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let staffId: string;
  let templateId: string;

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

    staffId = (
      await api('post', '/staff', {
        firstName: 'Turnos',
        lastName: 'E2E',
        birthDate: '1985-06-15',
        phone: '5500000001',
        role: 'driver',
        hireDate: '2020-01-01',
      }).expect(201)
    ).body.id;

    templateId = (
      await api('post', '/shift-templates', {
        name: `E2E Matutino ${Date.now()}`,
        shiftType: 'morning',
        startTime: '06:00',
        endTime: '16:00',
      }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    const scheduleIds = (await prisma.staffSchedule.findMany({ where: { staffId } })).map((s) => s.id);
    await prisma.staff.delete({ where: { id: staffId } }); // turnos en cascada
    await prisma.shiftTemplate.delete({ where: { id: templateId } });
    await prisma.auditLog.deleteMany({ where: { recordId: { in: [staffId, templateId, ...scheduleIds] } } });
    await app.close();
  });

  function api(method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) {
    const req = request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }

  it('crea un turno desde plantilla con horas calculadas', async () => {
    const res = await api('post', '/schedules', { staffId, scheduleDate: MON, templateId }).expect(201);
    expect(res.body.startAt).toBe('2030-03-04T12:00:00.000Z'); // 06:00 CDMX
    expect(res.body.workedHours).toBe(10);
    expect(res.body.shiftType).toBe('morning');

    await api('post', '/schedules', { staffId, scheduleDate: MON, isRestDay: true }).expect(409);
  });

  it('rechaza descanso insuficiente y permite forzar solo con motivo (admin)', async () => {
    const night = { staffId, scheduleDate: '2030-03-05', startTime: '22:00', endTime: '05:00', shiftType: 'night' };
    // martes 22:00 no choca con lunes 16:00 (30 h de descanso)
    const created = await api('post', '/schedules', night).expect(201);

    const tooSoon = { staffId, scheduleDate: '2030-03-06', startTime: '09:00', endTime: '15:00', shiftType: 'morning' };
    const rejected = await api('post', '/schedules', tooSoon).expect(400);
    expect(rejected.body.message[0]).toMatch(/Descanso insuficiente: 4 h/);

    await api('post', '/schedules', { ...tooSoon, force: true }).expect(400); // sin motivo
    const forced = await api('post', '/schedules', {
      ...tooSoon,
      force: true,
      overrideReason: 'Cobertura de emergencia',
    }).expect(201);
    expect(forced.body.overrideReason).toMatch(/^Cobertura de emergencia \[Reglas omitidas/);

    await api('delete', `/schedules/${forced.body.id}`).expect(204);
    await api('delete', `/schedules/${created.body.id}`).expect(204);
  });

  it('asignación masiva crea los válidos y reporta los rechazados', async () => {
    // Lunes ya tiene turno; martes a domingo con plantilla de 10 h: al 5° turno se rebasan 48 h
    const res = await api('post', '/schedules/bulk', {
      staffIds: [staffId],
      from: MON,
      to: '2030-03-10',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      templateId,
    }).expect(201);

    expect(res.body.created).toBe(3); // martes, miércoles y jueves (40 h)
    const reasons = res.body.skipped.map((s: { date: string; reason: string }) => `${s.date}: ${s.reason}`);
    expect(reasons).toEqual(
      expect.arrayContaining([
        `${MON}: Ya tiene turno ese día`,
        expect.stringMatching(/^2030-03-08: .*suma 50 h/),
      ]),
    );

    const week = await api('get', `/schedules?from=${MON}&to=2030-03-10&staffId=${staffId}`).expect(200);
    expect(week.body).toHaveLength(4);
  });
});
