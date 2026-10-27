import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Flota: catálogos y modelos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let supervisorToken: string;
  const stamp = Date.now();
  const ids = {
    users: [] as string[],
    cities: [] as string[],
    terminals: [] as string[],
    models: [] as string[],
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

    const email = `flota-sup-${stamp}@camionera.mx`;
    const sup = await call('post', '/users', adminToken)
      .send({
        email,
        fullName: 'Supervisor Flota',
        password: 'secreta123',
        role: 'supervisor',
      })
      .expect(201);
    ids.users.push(sup.body.id);
    supervisorToken = (await login(email, 'secreta123').expect(200)).body
      .accessToken;
  });

  afterAll(async () => {
    const recordIds = [
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
    await prisma.busModel.deleteMany({ where: { id: { in: ids.models } } });
    await prisma.terminal.deleteMany({ where: { id: { in: ids.terminals } } });
    await prisma.city.deleteMany({ where: { id: { in: ids.cities } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });
  const call = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  it('lista los combustibles sembrados y permite consultarlos al supervisor', async () => {
    const res = await call('get', '/fleet/fuel-types', supervisorToken).expect(
      200,
    );
    expect(res.body.map((f: { name: string }) => f.name)).toEqual(
      expect.arrayContaining(['Diésel', 'Gasolina']),
    );
  });

  it('crea ciudad y terminal; el supervisor no puede escribir', async () => {
    await call('post', '/fleet/cities', supervisorToken)
      .send({ name: 'X', state: 'Y' })
      .expect(403);

    const city = await call('post', '/fleet/cities', adminToken)
      .send({ name: `Ciudad ${stamp}`, state: 'Jalisco' })
      .expect(201);
    ids.cities.push(city.body.id);

    const terminal = await call('post', '/fleet/terminals', adminToken)
      .send({
        code: `t${String(stamp).slice(-6)}`,
        name: 'Terminal de prueba',
        cityId: city.body.id,
      })
      .expect(201);
    ids.terminals.push(terminal.body.id);
    expect(terminal.body.code).toBe(`T${String(stamp).slice(-6)}`);

    const list = await call('get', '/fleet/terminals', supervisorToken).expect(
      200,
    );
    expect(
      list.body.find((t: { id: string }) => t.id === terminal.body.id).city
        .name,
    ).toBe(`Ciudad ${stamp}`);

    // Sin ubicación no aparece entre las terminales utilizables
    const located = () =>
      call('get', '/fleet/terminals?located=true', supervisorToken).expect(200);
    expect(
      (await located()).body.some(
        (t: { id: string }) => t.id === terminal.body.id,
      ),
    ).toBe(false);

    // Latitud y longitud van juntas
    await call('patch', `/fleet/terminals/${terminal.body.id}`, adminToken)
      .send({ latitude: 20.6 })
      .expect(400);
    await call('patch', `/fleet/terminals/${terminal.body.id}`, adminToken)
      .send({ latitude: 20.628312, longitude: -103.285301 })
      .expect(200);
    expect(
      (await located()).body.some(
        (t: { id: string }) => t.id === terminal.body.id,
      ),
    ).toBe(true);
  });

  it('crea un modelo con capacidad derivada del layout y rechaza layouts inválidos', async () => {
    const diesel = await prisma.fuelType.findUniqueOrThrow({
      where: { name: 'Diésel' },
    });
    const layout = (
      await call(
        'get',
        '/fleet/bus-models/default-layout?rows=10',
        adminToken,
      ).expect(200)
    ).body;

    const base = {
      brand: 'PruebaBus',
      model: `M-${stamp}`,
      fuelTypeId: diesel.id,
      expectedEfficiency: 3.1,
    };

    // Dos pisos solo se permiten en doble piso
    const twoFloors = (
      await call(
        'get',
        '/fleet/bus-models/default-layout?rows=8&floors=2',
        adminToken,
      )
    ).body;
    await call('post', '/fleet/bus-models', adminToken)
      .send({ ...base, busType: 'standard', layout: twoFloors })
      .expect(400);

    const created = await call('post', '/fleet/bus-models', adminToken)
      .send({
        ...base,
        busType: 'executive',
        layout,
        features: ['WiFi'],
        preventiveKm: 15000,
        preventiveDays: 90,
      })
      .expect(201);
    ids.models.push(created.body.id);
    expect(created.body.seatCount).toBeGreaterThan(0);
    expect(created.body.fuelType.name).toBe('Diésel');

    // Cambiar a doble piso con el layout de dos pisos recalcula la capacidad
    const updated = await call(
      'patch',
      `/fleet/bus-models/${created.body.id}`,
      adminToken,
    )
      .send({ busType: 'double_decker', layout: twoFloors })
      .expect(200);
    expect(updated.body.seatCount).not.toBe(created.body.seatCount);

    await call('patch', `/fleet/bus-models/${created.body.id}`, supervisorToken)
      .send({ isActive: false })
      .expect(403);

    const search = await call(
      'get',
      `/fleet/bus-models?search=M-${stamp}`,
      supervisorToken,
    ).expect(200);
    expect(search.body.data).toHaveLength(1);
  });
});
