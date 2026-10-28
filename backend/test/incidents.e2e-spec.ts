import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Flota: incidencias (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let supervisorToken: string;
  const stamp = Date.now();
  const tag = String(stamp).slice(-6);
  const ids = {
    users: [] as string[],
    cities: [] as string[],
    terminals: [] as string[],
    models: [] as string[],
    categories: [] as string[],
  };
  let busId: string;
  let mechanicalId: string;
  let accidentId: string;

  const call = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  const newUser = async (role: string, name: string) => {
    const email = `inc-${name}-${stamp}@camionera.mx`;
    const res = await call('post', '/users', adminToken)
      .send({ email, fullName: `Prueba ${name}`, password: 'secreta123', role })
      .expect(201);
    ids.users.push(res.body.id);
    return (await login(email, 'secreta123').expect(200)).body
      .accessToken as string;
  };

  const busStatus = async () =>
    (await prisma.bus.findUniqueOrThrow({ where: { id: busId } })).status;

  const report = (token: string, body: Record<string, unknown> = {}) =>
    call('post', '/fleet/incidents', token).send({
      busId,
      categoryId: mechanicalId,
      severity: 'medium',
      description: 'Ruido en la suspensión trasera',
      occurredAt: new Date().toISOString(),
      ...body,
    });

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

    driverToken = await newUser('driver', 'conductor');
    otherDriverToken = await newUser('driver', 'otro');
    supervisorToken = await newUser('supervisor', 'supervisor');

    const mechanical = await call(
      'post',
      '/fleet/incidents/categories',
      adminToken,
    )
      .send({ name: `Mecánica ${stamp}` })
      .expect(201);
    mechanicalId = mechanical.body.id;
    const accident = await call(
      'post',
      '/fleet/incidents/categories',
      adminToken,
    )
      .send({ name: `Accidente ${stamp}`, isAccident: true })
      .expect(201);
    accidentId = accident.body.id;
    ids.categories.push(mechanicalId, accidentId);

    const city = await call('post', '/fleet/cities', adminToken).send({
      name: `Ciudad I ${stamp}`,
      state: 'Sinaloa',
    });
    ids.cities.push(city.body.id);
    const terminal = await call('post', '/fleet/terminals', adminToken).send({
      code: `I${tag}`,
      name: 'Terminal incidencias',
      cityId: city.body.id,
      latitude: 23.2,
      longitude: -106.4,
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
        brand: 'PruebaI',
        model: `I-${stamp}`,
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
        economicNumber: `I${tag}`,
        plates: `IN${tag}`,
        // Los VIN no admiten I, O ni Q
        vin: `1NCDX${tag}000000`.slice(0, 17),
        year: 2023,
        busModelId: model.body.id,
        terminalId: terminal.body.id,
        odometerKm: 80000,
      })
      .expect(201);
    busId = bus.body.id;
  });

  afterAll(async () => {
    const [incidents, orders] = await Promise.all([
      prisma.busIncident.findMany({ where: { busId }, select: { id: true } }),
      prisma.maintenanceOrder.findMany({
        where: { busId },
        select: { id: true },
      }),
    ]);
    const recordIds = [
      busId,
      ...incidents.map((i) => i.id),
      ...orders.map((o) => o.id),
      ...ids.categories,
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
    await prisma.busIncident.deleteMany({ where: { busId } });
    await prisma.incidentCategory.deleteMany({
      where: { id: { in: ids.categories } },
    });
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

  it('el conductor reporta y solo ve lo suyo', async () => {
    const res = await report(driverToken).expect(201);
    expect(res.body.status).toBe('reported');
    await call(
      'get',
      `/fleet/incidents/${res.body.id}`,
      otherDriverToken,
    ).expect(403);
    const mine = await call('get', '/fleet/incidents', otherDriverToken).expect(
      200,
    );
    expect(mine.body.data).toHaveLength(0);
    // Corrige mientras nadie la revisa
    await call('patch', `/fleet/incidents/${res.body.id}`, driverToken)
      .send({ severity: 'low' })
      .expect(200);
    // El conductor no revisa ni cierra
    await call(
      'post',
      `/fleet/incidents/${res.body.id}/review`,
      driverToken,
    ).expect(403);
    await call(
      'post',
      `/fleet/incidents/${res.body.id}/review`,
      supervisorToken,
    )
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('in_review'));
    await call('patch', `/fleet/incidents/${res.body.id}`, driverToken)
      .send({ severity: 'medium' })
      .expect(400);
    await call(
      'post',
      `/fleet/incidents/${res.body.id}/resolve`,
      supervisorToken,
    )
      .send({ resolution: 'Se ajustó la suspensión en patio' })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('resolved'));
  });

  it('los datos del siniestro solo se guardan en accidentes', async () => {
    const plain = await report(driverToken, {
      claimNumber: 'SIN-1',
      injuries: true,
    }).expect(201);
    expect(plain.body.claimNumber).toBeNull();
    expect(plain.body.injuries).toBeNull();
    const crash = await report(driverToken, {
      categoryId: accidentId,
      claimNumber: 'SIN-2',
      thirdParties: true,
    }).expect(201);
    expect(crash.body.claimNumber).toBe('SIN-2');
    expect(crash.body.thirdParties).toBe(true);
    for (const id of [plain.body.id, crash.body.id])
      await call('post', `/fleet/incidents/${id}/dismiss`, adminToken)
        .send({ resolution: 'Prueba' })
        .expect(200);
  });

  it('crítica → fuera de servicio → orden correctiva → resuelta y disponible', async () => {
    const res = await report(driverToken, {
      severity: 'critical',
      description: 'Fuga de aceite en motor',
    }).expect(201);
    const id = res.body.id;
    expect(await busStatus()).toBe('out_of_service');

    // Aparece en Pendientes de Inicio
    const pending = await call('get', '/dashboard/pending', adminToken).expect(
      200,
    );
    expect(
      pending.body.some((p: { id: string }) => p.id === `incident-${id}`),
    ).toBe(true);

    // Solo coordinación crea la orden
    await call('post', `/fleet/incidents/${id}/order`, supervisorToken)
      .send({ scheduledDate: '2026-11-01' })
      .expect(403);
    const order = await call('post', `/fleet/incidents/${id}/order`, adminToken)
      .send({ scheduledDate: '2026-11-01' })
      .expect(201);
    expect(order.body.type).toBe('corrective');
    expect(order.body.priority).toBe('urgent');
    expect(order.body.incident.id).toBe(id);
    await call('post', `/fleet/incidents/${id}/order`, adminToken)
      .send({ scheduledDate: '2026-11-01' })
      .expect(400);
    // Con la orden abierta no se cierra a mano
    await call('post', `/fleet/incidents/${id}/resolve`, adminToken)
      .send({ resolution: 'x de prueba' })
      .expect(400);

    // La unidad fuera de servicio sí entra al taller con un correctivo
    await call(
      'post',
      `/fleet/maintenance/orders/${order.body.id}/start`,
      adminToken,
    )
      .send({ km: 80100 })
      .expect(200);
    expect(await busStatus()).toBe('maintenance');
    await call(
      'post',
      `/fleet/maintenance/orders/${order.body.id}/complete`,
      adminToken,
    )
      .send({ km: 80110, workPerformed: 'Cambio de retén de cigüeñal' })
      .expect(200);

    const closed = await call(
      'get',
      `/fleet/incidents/${id}`,
      adminToken,
    ).expect(200);
    expect(closed.body.status).toBe('resolved');
    expect(closed.body.resolution).toContain('Cambio de retén');
    expect(await busStatus()).toBe('available');
  });

  it('con dos críticas abiertas la unidad sigue fuera hasta cerrar ambas', async () => {
    const a = await report(driverToken, { severity: 'critical' }).expect(201);
    const b = await report(driverToken, { severity: 'critical' }).expect(201);
    expect(await busStatus()).toBe('out_of_service');
    await call('post', `/fleet/incidents/${a.body.id}/dismiss`, adminToken)
      .send({ resolution: 'Duplicada' })
      .expect(200);
    expect(await busStatus()).toBe('out_of_service');
    await call('post', `/fleet/incidents/${b.body.id}/resolve`, adminToken)
      .send({ resolution: 'Revisada, sin falla' })
      .expect(200);
    expect(await busStatus()).toBe('available');
  });

  it('bajar la gravedad de crítica regresa la unidad', async () => {
    const res = await report(driverToken, { severity: 'critical' }).expect(201);
    expect(await busStatus()).toBe('out_of_service');
    await call('patch', `/fleet/incidents/${res.body.id}`, adminToken)
      .send({ severity: 'high' })
      .expect(200);
    expect(await busStatus()).toBe('available');
    await call('post', `/fleet/incidents/${res.body.id}/dismiss`, adminToken)
      .send({ resolution: 'Prueba' })
      .expect(200);
  });
});
