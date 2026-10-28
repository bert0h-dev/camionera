import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Flota: combustible (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let coordinatorToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let supervisorToken: string;
  let hrToken: string;
  const stamp = Date.now();
  const tag = String(stamp).slice(-6);
  const ids = {
    users: [] as string[],
    cities: [] as string[],
    terminals: [] as string[],
    models: [] as string[],
  };
  let busId: string;

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

  const newUser = async (role: string, name: string) => {
    const email = `fuel-${name}-${stamp}@camionera.mx`;
    const res = await call('post', '/users', adminToken)
      .send({ email, fullName: `Prueba ${name}`, password: 'secreta123', role })
      .expect(201);
    ids.users.push(res.body.id);
    return (await login(email, 'secreta123').expect(200)).body
      .accessToken as string;
  };

  const load = (token: string, body: Record<string, unknown>) =>
    call('post', '/fleet/fuel', token).send({
      busId,
      loadedAt: new Date().toISOString(),
      unitPrice: 25.5,
      ...body,
    });

  const bus = () => prisma.bus.findUniqueOrThrow({ where: { id: busId } });

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

    coordinatorToken = await newUser('coordinator', 'coordinador');
    driverToken = await newUser('driver', 'conductor');
    otherDriverToken = await newUser('driver', 'otro');
    supervisorToken = await newUser('supervisor', 'supervisor');
    hrToken = await newUser('hr', 'rrhh');

    const city = await call('post', '/fleet/cities', adminToken).send({
      name: `Ciudad F ${stamp}`,
      state: 'Jalisco',
    });
    ids.cities.push(city.body.id);
    const terminal = await call('post', '/fleet/terminals', adminToken).send({
      code: `F${tag}`,
      name: 'Terminal combustible',
      cityId: city.body.id,
      latitude: 20.6,
      longitude: -103.3,
    });
    ids.terminals.push(terminal.body.id);
    const diesel = await prisma.fuelType.findUniqueOrThrow({
      where: { name: 'Diésel' },
    });
    const layout = (
      await call('get', '/fleet/bus-models/default-layout?rows=6', adminToken)
    ).body;
    const model = await call('post', '/fleet/bus-models', adminToken)
      .send({
        brand: 'PruebaF',
        model: `F-${stamp}`,
        busType: 'standard',
        fuelTypeId: diesel.id,
        tankCapacity: 400,
        expectedEfficiency: 3,
        layout,
      })
      .expect(201);
    ids.models.push(model.body.id);
    const created = await call('post', '/fleet/buses', adminToken)
      .send({
        economicNumber: `F${tag}`,
        plates: `FU${tag}`,
        vin: `1FCDX${tag}000000`.slice(0, 17),
        year: 2023,
        busModelId: model.body.id,
        terminalId: terminal.body.id,
        odometerKm: 10000,
      })
      .expect(201);
    busId = created.body.id;
  });

  afterAll(async () => {
    const loads = await prisma.fuelLoad.findMany({
      where: { busId },
      select: { id: true },
    });
    const recordIds = [
      busId,
      ...loads.map((l) => l.id),
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
    await prisma.fuelLoad.deleteMany({ where: { busId } });
    await prisma.bus.deleteMany({ where: { id: busId } });
    await prisma.busModel.deleteMany({ where: { id: { in: ids.models } } });
    await prisma.terminal.deleteMany({ where: { id: { in: ids.terminals } } });
    await prisma.city.deleteMany({ where: { id: { in: ids.cities } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
  });

  it('RRHH no entra; supervisión consulta pero no registra', async () => {
    await call('get', '/fleet/fuel', hrToken).expect(403);
    await call('get', '/fleet/fuel', supervisorToken).expect(200);
    await load(supervisorToken, { quantity: 100, odometerKm: 10100 }).expect(
      403,
    );
  });

  it('la carga de coordinación entra confirmada, mueve el odómetro y calcula el total', async () => {
    const res = await load(coordinatorToken, {
      quantity: 300,
      odometerKm: 11000,
    }).expect(201);
    expect(res.body.status).toBe('confirmed');
    expect(Number(res.body.total)).toBe(7650);
    expect(res.body.efficiency).toBeNull();
    expect((await bus()).odometerKm).toBe(11000);
  });

  it('rechaza pasar el tanque o un odómetro que no avanza', async () => {
    await load(coordinatorToken, { quantity: 401, odometerKm: 12000 }).expect(
      400,
    );
    await load(coordinatorToken, { quantity: 100, odometerKm: 11000 }).expect(
      400,
    );
  });

  it('la parcial acumula y el tanque lleno siguiente mide el tramo', async () => {
    const partial = await load(coordinatorToken, {
      quantity: 100,
      odometerKm: 11400,
      isFullTank: false,
    }).expect(201);
    expect(partial.body.efficiency).toBeNull();
    const full = await load(coordinatorToken, {
      quantity: 200,
      odometerKm: 11900,
    }).expect(201);
    expect(full.body.tripKm).toBe(900);
    expect(Number(full.body.efficiency)).toBe(3);
    const [eff] = (
      await call('get', `/fleet/fuel/efficiency?busId=${busId}`, adminToken)
    ).body;
    expect(eff.low).toBe(false);
  });

  it('solo la última confirmada se corrige y el rendimiento se recalcula', async () => {
    const list = (
      await call('get', `/fleet/fuel?busId=${busId}`, coordinatorToken)
    ).body.data;
    const [last, partial] = list;
    await call('patch', `/fleet/fuel/${partial.id}`, coordinatorToken)
      .send({ quantity: 120 })
      .expect(400);
    // 900 km / 360 L = 2.5: 16.7 % bajo el esperado
    const fixed = await call(
      'patch',
      `/fleet/fuel/${last.id}`,
      coordinatorToken,
    )
      .send({ quantity: 260 })
      .expect(200);
    expect(Number(fixed.body.efficiency)).toBe(2.5);
    const [eff] = (
      await call('get', `/fleet/fuel/efficiency?busId=${busId}`, adminToken)
    ).body;
    expect(eff.low).toBe(true);
    const pending = (await call('get', '/dashboard/pending', coordinatorToken))
      .body;
    expect(
      pending.some((p: { id: string }) => p.id === `fuel-low-${busId}`),
    ).toBe(true);
  });

  it('la carga del conductor queda pendiente y no cuenta hasta confirmarse', async () => {
    const res = await load(driverToken, {
      quantity: 280,
      odometerKm: 12800,
    }).expect(201);
    expect(res.body.status).toBe('pending');
    expect((await bus()).odometerKm).toBe(11900);

    // El conductor ve solo las suyas
    const mine = (await call('get', '/fleet/fuel', driverToken)).body.data;
    expect(mine).toHaveLength(1);
    await call('get', `/fleet/fuel/${res.body.id}`, otherDriverToken).expect(
      403,
    );
    await call(
      'post',
      `/fleet/fuel/${res.body.id}/confirm`,
      driverToken,
    ).expect(403);

    const pending = (await call('get', '/dashboard/pending', coordinatorToken))
      .body;
    expect(
      pending.some(
        (p: { id: string }) => p.id === `fuel-pending-${res.body.id}`,
      ),
    ).toBe(true);

    const confirmed = await call(
      'post',
      `/fleet/fuel/${res.body.id}/confirm`,
      coordinatorToken,
    ).expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    // 900 km / 280 L
    expect(Number(confirmed.body.efficiency)).toBe(3.21);
    expect((await bus()).odometerKm).toBe(12800);

    // Ya confirmada, el conductor no la corrige
    await call('patch', `/fleet/fuel/${res.body.id}`, driverToken)
      .send({ quantity: 270 })
      .expect(400);
  });

  it('coordinación rechaza con motivo y la carga no cuenta', async () => {
    const res = await load(driverToken, {
      quantity: 50,
      odometerKm: 12900,
      isFullTank: false,
    }).expect(201);
    await call('post', `/fleet/fuel/${res.body.id}/reject`, coordinatorToken)
      .send({})
      .expect(400);
    const rejected = await call(
      'post',
      `/fleet/fuel/${res.body.id}/reject`,
      coordinatorToken,
    )
      .send({ reason: 'El ticket no coincide' })
      .expect(200);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.rejectReason).toBe('El ticket no coincide');
    expect((await bus()).odometerKm).toBe(12800);
  });

  it('el resumen y las opciones del formulario', async () => {
    const summary = (await call('get', '/fleet/fuel/summary', adminToken)).body;
    expect(summary.loadsThisMonth).toBeGreaterThanOrEqual(4);
    const options = (
      await call('get', '/fleet/fuel/form-options', driverToken).expect(200)
    ).body;
    const mine = options.buses.find((b: { id: string }) => b.id === busId);
    expect(mine.lastLoadKm).toBe(12800);
    expect(options.lastPrices.length).toBeGreaterThan(0);
  });
});
