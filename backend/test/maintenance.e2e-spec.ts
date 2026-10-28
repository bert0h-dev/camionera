import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Flota: mantenimiento (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let mechanicToken: string;
  let otherMechanicToken: string;
  let mechanicId: string;
  const stamp = Date.now();
  const tag = String(stamp).slice(-6);
  const ids = {
    users: [] as string[],
    cities: [] as string[],
    terminals: [] as string[],
    models: [] as string[],
  };
  let busId: string;

  const call = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  const newUser = async (role: string, name: string) => {
    const email = `mtto-${name}-${stamp}@camionera.mx`;
    const res = await call('post', '/users', adminToken)
      .send({ email, fullName: `Prueba ${name}`, password: 'secreta123', role })
      .expect(201);
    ids.users.push(res.body.id);
    return {
      id: res.body.id as string,
      token: (await login(email, 'secreta123').expect(200)).body
        .accessToken as string,
    };
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

    const mech = await newUser('mechanic', 'mecanico');
    mechanicId = mech.id;
    mechanicToken = mech.token;
    otherMechanicToken = (await newUser('mechanic', 'otro')).token;

    const city = await call('post', '/fleet/cities', adminToken).send({
      name: `Ciudad M ${stamp}`,
      state: 'Jalisco',
    });
    ids.cities.push(city.body.id);
    const terminal = await call('post', '/fleet/terminals', adminToken).send({
      code: `M${tag}`,
      name: 'Terminal mantenimiento',
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
        brand: 'PruebaM',
        model: `M-${stamp}`,
        busType: 'standard',
        fuelTypeId: diesel.id,
        layout,
        preventiveKm: 10000,
        preventiveDays: 60,
      })
      .expect(201);
    ids.models.push(model.body.id);
    const bus = await call('post', '/fleet/buses', adminToken)
      .send({
        economicNumber: `M${tag}`,
        plates: `MT${tag}`,
        vin: `1MANT${tag}000000`.slice(0, 17),
        year: 2023,
        busModelId: model.body.id,
        terminalId: terminal.body.id,
        odometerKm: 50000,
      })
      .expect(201);
    busId = bus.body.id;
  });

  afterAll(async () => {
    const orders = await prisma.maintenanceOrder.findMany({
      where: { busId },
      select: { id: true },
    });
    const recordIds = [
      busId,
      ...orders.map((o) => o.id),
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
    await prisma.maintenanceOrder.deleteMany({ where: { busId } });
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

  it('calcula el próximo preventivo desde el alta', async () => {
    const plan = await call(
      'get',
      `/fleet/maintenance/plan/${busId}`,
      adminToken,
    ).expect(200);
    expect(plan.body.dueKm).toBe(60000);
    expect(plan.body.status).toBe('ok');
  });

  it('flujo completo: programada → en proceso → terminada', async () => {
    await call('post', '/fleet/maintenance/orders', mechanicToken)
      .send({
        busId,
        type: 'preventive',
        description: 'x',
        scheduledDate: '2026-11-01',
      })
      .expect(403);
    const created = await call('post', '/fleet/maintenance/orders', adminToken)
      .send({
        busId,
        type: 'preventive',
        description: 'Servicio 10,000 km',
        scheduledDate: '2026-11-01',
        mechanicId,
      })
      .expect(201);
    const orderId = created.body.id;
    expect(created.body.tasks.length).toBeGreaterThanOrEqual(10); // tareas del catálogo

    // Solo un preventivo abierto por unidad
    await call('post', '/fleet/maintenance/orders', adminToken)
      .send({
        busId,
        type: 'preventive',
        description: 'Otro',
        scheduledDate: '2026-11-02',
      })
      .expect(400);

    // Otro mecánico no la ve
    await call(
      'get',
      `/fleet/maintenance/orders/${orderId}`,
      otherMechanicToken,
    ).expect(403);

    await call(
      'post',
      `/fleet/maintenance/orders/${orderId}/start`,
      mechanicToken,
    )
      .send({ km: 49000 })
      .expect(400);
    await call(
      'post',
      `/fleet/maintenance/orders/${orderId}/start`,
      mechanicToken,
    )
      .send({ km: 59500 })
      .expect(200);
    let bus = await call('get', `/fleet/buses/${busId}`, adminToken);
    expect(bus.body.status).toBe('maintenance');
    expect(bus.body.odometerKm).toBe(59500);

    const task = created.body.tasks[0];
    await call(
      'patch',
      `/fleet/maintenance/orders/${orderId}/tasks/${task.id}`,
      mechanicToken,
    )
      .send({ isDone: true })
      .expect(200);

    const done = await call(
      'post',
      `/fleet/maintenance/orders/${orderId}/complete`,
      mechanicToken,
    )
      .send({
        km: 59510,
        workPerformed: 'Servicio completo',
        laborCost: 1500,
        partsCost: 3200.5,
      })
      .expect(200);
    expect(done.body.status).toBe('completed');

    bus = await call('get', `/fleet/buses/${busId}`, adminToken);
    expect(bus.body.status).toBe('available');
    const plan = await call(
      'get',
      `/fleet/maintenance/plan/${busId}`,
      adminToken,
    );
    expect(plan.body.dueKm).toBe(69510); // reinicia desde el servicio
  });

  it('el correctivo no reinicia el preventivo y se puede cancelar en proceso', async () => {
    const created = await call('post', '/fleet/maintenance/orders', adminToken)
      .send({
        busId,
        type: 'corrective',
        description: 'Ruido en suspensión',
        scheduledDate: '2026-11-05',
      })
      .expect(201);
    expect(created.body.tasks).toHaveLength(0);
    await call(
      'post',
      `/fleet/maintenance/orders/${created.body.id}/start`,
      adminToken,
    )
      .send({ km: 59600 })
      .expect(200);
    await call(
      'post',
      `/fleet/maintenance/orders/${created.body.id}/cancel`,
      mechanicToken,
    )
      .send({ reason: 'x' })
      .expect(403);
    await call(
      'post',
      `/fleet/maintenance/orders/${created.body.id}/cancel`,
      adminToken,
    )
      .send({ reason: 'Se pospone' })
      .expect(200);
    const bus = await call('get', `/fleet/buses/${busId}`, adminToken);
    expect(bus.body.status).toBe('available');
    const plan = await call(
      'get',
      `/fleet/maintenance/plan/${busId}`,
      adminToken,
    );
    expect(plan.body.dueKm).toBe(69510);
  });

  it('resume costos del mes', async () => {
    const res = await call(
      'get',
      '/fleet/maintenance/summary',
      adminToken,
    ).expect(200);
    expect(res.body.costThisMonth).toBeGreaterThanOrEqual(4700.5);
  });
});
