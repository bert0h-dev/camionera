import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { addDays, BUSINESS_TIMEZONE, dateKey, today } from './../src/common/dates.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

/** Hora local de la central desplazada `minutes` desde ahora, como "HH:mm". */
const localTime = (minutes: number) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(Date.now() + minutes * 60_000));

const TODAY = dateKey(today());
const YESTERDAY = dateKey(addDays(today(), -1));

// Requiere la BD de .env y el admin creado con `npm run prisma:seed`
describe('Attendance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const staffIds: string[] = [];
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
    adminToken = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
  });

  afterAll(async () => {
    const staff = await prisma.staff.findMany({ where: { id: { in: staffIds } } });
    const userIds = staff.map((s) => s.userId).filter((id): id is string => !!id);
    const recordIds = [
      ...(await prisma.staffSchedule.findMany({ where: { staffId: { in: staffIds } } })).map((s) => s.id),
      ...(await prisma.staffAttendance.findMany({ where: { staffId: { in: staffIds } } })).map((a) => a.id),
    ];
    await prisma.staff.deleteMany({ where: { id: { in: staffIds } } }); // turnos y asistencias en cascada
    await prisma.auditLog.deleteMany({
      where: { OR: [{ recordId: { in: [...staffIds, ...userIds, ...recordIds] } }, { userId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function login(email: string, password: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  }

  function api(token: string, method: 'get' | 'post' | 'patch', url: string, body?: object) {
    const req = request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }

  async function newStaff(name: string, withUser = false) {
    const staff = await api(adminToken, 'post', '/staff', {
      firstName: name,
      lastName: 'AsistenciaE2E',
      birthDate: '1985-06-15',
      phone: '5500000002',
      role: 'driver',
      hireDate: '2020-01-01',
    }).expect(201);
    staffIds.push(staff.body.id);
    if (!withUser) return { id: staff.body.id as string, token: '' };

    const email = `asis-${name.toLowerCase()}-${stamp}@camionera.mx`;
    await api(adminToken, 'post', `/staff/${staff.body.id}/credentials`, { email, password: 'secreta123' }).expect(201);
    return { id: staff.body.id as string, token: await login(email, 'secreta123') };
  }

  it('autoregistro: entrada, duplicado, salida', async () => {
    const me = await newStaff('Auto', true);
    // Turno que empezó hace 5 min y dura 4 h
    await api(adminToken, 'post', '/schedules', {
      staffId: me.id,
      scheduleDate: TODAY,
      startTime: localTime(-5),
      endTime: localTime(240),
      shiftType: 'morning',
    }).expect(201);

    const today = await api(me.token, 'get', '/attendance/me/today').expect(200);
    expect(today.body.schedule).not.toBeNull();
    expect(today.body.attendance).toBeNull();

    const checkIn = await api(me.token, 'post', '/attendance/me/check-in').expect(201);
    expect(checkIn.body).toMatchObject({ status: 'present', source: 'self' });
    expect(checkIn.body.lateMinutes).toBeGreaterThanOrEqual(4);

    await api(me.token, 'post', '/attendance/me/check-in').expect(409);

    // Salir a los pocos minutos = trabajó menos del 50 %
    const checkOut = await api(me.token, 'post', '/attendance/me/check-out').expect(201);
    expect(checkOut.body.status).toBe('half_day');
    expect(checkOut.body.checkOutAt).not.toBeNull();

    await api(me.token, 'post', '/attendance/me/check-out').expect(400);
  });

  it('autoregistro sin turno se rechaza', async () => {
    const me = await newStaff('Libre', true);
    const res = await api(me.token, 'post', '/attendance/me/check-in').expect(400);
    expect(res.body.message).toMatch(/No tienes un turno/);
  });

  it('cierre del día: falta y falta justificada; corrección con motivo', async () => {
    const absent = await newStaff('Falta');
    const onVacation = await newStaff('Vacaciones');
    for (const s of [absent, onVacation]) {
      await api(adminToken, 'post', '/schedules', {
        staffId: s.id,
        scheduleDate: YESTERDAY,
        startTime: '08:00',
        endTime: '16:00',
        shiftType: 'morning',
      }).expect(201);
    }
    await api(adminToken, 'patch', `/staff/${onVacation.id}`, { status: 'vacation' }).expect(200);

    await api(adminToken, 'post', '/attendance/close-day', { date: TODAY }).expect(400); // hoy no se cierra
    const closed = await api(adminToken, 'post', '/attendance/close-day', { date: YESTERDAY }).expect(201);
    expect(closed.body.absent).toBeGreaterThanOrEqual(1);
    expect(closed.body.excused).toBeGreaterThanOrEqual(1);

    const day = await api(adminToken, 'get', `/attendance/day?date=${YESTERDAY}`).expect(200);
    const statusOf = (id: string) =>
      day.body.find((r: { staff: { id: string } }) => r.staff.id === id).attendance.status;
    expect(statusOf(absent.id)).toBe('absent');
    expect(statusOf(onVacation.id)).toBe('excused');

    // Volver a cerrar no duplica
    const again = await api(adminToken, 'post', '/attendance/close-day', { date: YESTERDAY }).expect(201);
    const mineAgain = await prisma.staffAttendance.count({ where: { staffId: absent.id } });
    expect(mineAgain).toBe(1);
    expect(again.body).toBeDefined();

    // Corrección: llegó 08:20 y salió 16:00 (sin motivo = 400)
    const record = day.body.find((r: { staff: { id: string } }) => r.staff.id === absent.id).attendance;
    await api(adminToken, 'patch', `/attendance/${record.id}`, { checkInTime: '08:20', checkOutTime: '16:00' }).expect(
      400,
    );
    const fixed = await api(adminToken, 'patch', `/attendance/${record.id}`, {
      checkInTime: '08:20',
      checkOutTime: '16:00',
      notes: 'Olvidó checar; confirmado por supervisor',
    }).expect(200);
    expect(fixed.body).toMatchObject({ status: 'late', lateMinutes: 20, workedMinutes: 460, source: 'manual' });

    const summary = await api(adminToken, 'get', `/attendance/summary?from=${YESTERDAY}&to=${TODAY}`).expect(200);
    const row = summary.body.find((r: { staff: { id: string } }) => r.staff.id === absent.id);
    expect(row).toMatchObject({ late: 1, absent: 0, lateMinutes: 20, workedMinutes: 460 });
  });

  it('captura manual duplicada responde 409', async () => {
    const s = await newStaff('Manual');
    await api(adminToken, 'post', '/attendance', { staffId: s.id, date: YESTERDAY, excused: true, notes: 'Permiso' }).expect(
      201,
    );
    await api(adminToken, 'post', '/attendance', { staffId: s.id, date: YESTERDAY, checkInTime: '09:00' }).expect(409);
  });
});
