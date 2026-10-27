import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Flota: unidades (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let supervisorToken: string;
  const stamp = Date.now();
  const tag = String(stamp).slice(-6);
  const ids = {
    users: [] as string[],
    cities: [] as string[],
    terminals: [] as string[],
    models: [] as string[],
    buses: [] as string[],
  };
  let terminalId: string;
  let unlocatedTerminalId: string;
  let modelId: string;
  let otherModelId: string;

  const call = (
    method: 'get' | 'post' | 'patch' | 'delete',
    url: string,
    token: string,
  ) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

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

    const email = `unidades-sup-${stamp}@camionera.mx`;
    const sup = await call('post', '/users', adminToken)
      .send({
        email,
        fullName: 'Supervisor Unidades',
        password: 'secreta123',
        role: 'supervisor',
      })
      .expect(201);
    ids.users.push(sup.body.id);
    supervisorToken = (await login(email, 'secreta123').expect(200)).body
      .accessToken;

    const city = await call('post', '/fleet/cities', adminToken)
      .send({ name: `Ciudad U ${stamp}`, state: 'Jalisco' })
      .expect(201);
    ids.cities.push(city.body.id);
    const located = await call('post', '/fleet/terminals', adminToken)
      .send({
        code: `U${tag}`,
        name: 'Terminal unidades',
        cityId: city.body.id,
        latitude: 20.6,
        longitude: -103.3,
      })
      .expect(201);
    const unlocated = await call('post', '/fleet/terminals', adminToken)
      .send({
        code: `N${tag}`,
        name: 'Terminal sin ubicación',
        cityId: city.body.id,
      })
      .expect(201);
    terminalId = located.body.id;
    unlocatedTerminalId = unlocated.body.id;
    ids.terminals.push(terminalId, unlocatedTerminalId);

    const diesel = await prisma.fuelType.findUniqueOrThrow({
      where: { name: 'Diésel' },
    });
    const layout = (
      await call('get', '/fleet/bus-models/default-layout?rows=10', adminToken)
    ).body;
    const small = (
      await call('get', '/fleet/bus-models/default-layout?rows=6', adminToken)
    ).body;
    const m1 = await call('post', '/fleet/bus-models', adminToken)
      .send({
        brand: 'PruebaU',
        model: `A-${stamp}`,
        busType: 'standard',
        fuelTypeId: diesel.id,
        layout,
      })
      .expect(201);
    const m2 = await call('post', '/fleet/bus-models', adminToken)
      .send({
        brand: 'PruebaU',
        model: `B-${stamp}`,
        busType: 'standard',
        fuelTypeId: diesel.id,
        layout: small,
      })
      .expect(201);
    modelId = m1.body.id;
    otherModelId = m2.body.id;
    ids.models.push(modelId, otherModelId);
  });

  afterAll(async () => {
    const seatIds = (
      await prisma.busSeat.findMany({
        where: { busId: { in: ids.buses } },
        select: { id: true },
      })
    ).map((s) => s.id);
    const docIds = (
      await prisma.busDocument.findMany({
        where: { busId: { in: ids.buses } },
        select: { id: true },
      })
    ).map((d) => d.id);
    const recordIds = [
      ...ids.buses,
      ...seatIds,
      ...docIds,
      ...ids.models,
      ...ids.terminals,
      ...ids.cities,
      ...ids.users,
    ];
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ recordId: { in: recordIds } }, { userId: { in: ids.users } }],
      },
    });
    await prisma.securityEvent.deleteMany({
      where: { userId: { in: ids.users } },
    });
    await prisma.bus.deleteMany({ where: { id: { in: ids.buses } } });
    await prisma.busModel.deleteMany({ where: { id: { in: ids.models } } });
    await prisma.terminal.deleteMany({ where: { id: { in: ids.terminals } } });
    await prisma.city.deleteMany({ where: { id: { in: ids.cities } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
  });

  const busData = () => ({
    economicNumber: `E${tag}`,
    plates: `P${tag}`,
    vin: `1HGBH41JX${tag}AB`.slice(0, 17).padEnd(17, '0'),
    year: 2022,
    busModelId: modelId,
    terminalId,
    odometerKm: 1000,
  });

  it('da de alta la unidad copiando los asientos y exige terminal ubicada', async () => {
    await call('post', '/fleet/buses', adminToken)
      .send({ ...busData(), terminalId: unlocatedTerminalId })
      .expect(400);
    await call('post', '/fleet/buses', supervisorToken)
      .send(busData())
      .expect(403);

    const res = await call('post', '/fleet/buses', adminToken)
      .send(busData())
      .expect(201);
    ids.buses.push(res.body.id);
    const model = await prisma.busModel.findUniqueOrThrow({
      where: { id: modelId },
    });
    expect(res.body.seats).toHaveLength(model.seatCount);
    expect(res.body.fit).toBe(false);
    expect(res.body.reasons.join(' ')).toMatch(/Seguro/);
  });

  it('queda apta con seguro y tarjeta vigentes', async () => {
    const id = ids.buses[0];
    await call('post', `/fleet/buses/${id}/documents`, adminToken)
      .send({
        type: 'insurance',
        folio: 'POL-1',
        issueDate: '2026-01-01',
        expiryDate: '2025-01-01',
      })
      .expect(400);
    await call('post', `/fleet/buses/${id}/documents`, adminToken)
      .send({
        type: 'insurance',
        folio: 'POL-1',
        issueDate: '2026-01-01',
        expiryDate: '2099-01-01',
      })
      .expect(201);
    await call('post', `/fleet/buses/${id}/documents`, adminToken)
      .send({
        type: 'circulation_card',
        folio: 'TC-1',
        issueDate: '2026-01-01',
      })
      .expect(201);
    const bus = await call('get', `/fleet/buses/${id}`, supervisorToken).expect(
      200,
    );
    expect(bus.body.fit).toBe(true);
  });

  it('el odómetro no baja y queda en el historial', async () => {
    const id = ids.buses[0];
    await call('post', `/fleet/buses/${id}/odometer`, adminToken)
      .send({ km: 999 })
      .expect(400);
    const ok = await call('post', `/fleet/buses/${id}/odometer`, adminToken)
      .send({ km: 1500 })
      .expect(200);
    expect(ok.body.odometerKm).toBe(1500);
    const history = await call(
      'get',
      `/fleet/buses/${id}/history`,
      supervisorToken,
    ).expect(200);
    expect(history.body.readings.map((r: { km: number }) => r.km)).toEqual([
      1500, 1000,
    ]);
  });

  it('bloquea un asiento con motivo', async () => {
    const id = ids.buses[0];
    const seat = (await call('get', `/fleet/buses/${id}`, adminToken)).body
      .seats[0];
    await call('patch', `/fleet/buses/${id}/seats/${seat.id}`, adminToken)
      .send({ blocked: true })
      .expect(400);
    await call('patch', `/fleet/buses/${id}/seats/${seat.id}`, adminToken)
      .send({ blocked: true, reason: 'Respaldo roto' })
      .expect(200);
    const list = await call(
      'get',
      `/fleet/buses?search=E${tag}`,
      supervisorToken,
    ).expect(200);
    expect(list.body.data[0].blockedSeats).toBe(1);
  });

  it('el modelo solo se cambia antes de salir a servicio', async () => {
    const id = ids.buses[0];
    await call('post', `/fleet/buses/${id}/status`, adminToken)
      .send({ status: 'maintenance' })
      .expect(400);
    await call('post', `/fleet/buses/${id}/status`, adminToken)
      .send({ status: 'in_service' })
      .expect(200);
    await call('post', `/fleet/buses/${id}/status`, adminToken)
      .send({ status: 'available' })
      .expect(200);
    await call('patch', `/fleet/buses/${id}`, adminToken)
      .send({ busModelId: otherModelId })
      .expect(400);
    const bus = await call('get', `/fleet/buses/${id}`, adminToken).expect(200);
    expect(bus.body.canChangeModel).toBe(false);
  });

  it('resume la flota para la banda', async () => {
    const res = await call(
      'get',
      '/fleet/buses/summary',
      supervisorToken,
    ).expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.alertDays).toBe(30);
  });
});
