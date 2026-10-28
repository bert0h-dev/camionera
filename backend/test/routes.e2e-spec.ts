import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Rutas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let coordinatorToken: string;
  let vendorToken: string;
  let hrToken: string;
  const stamp = Date.now();
  const tag = String(stamp).slice(-6);
  const ids = {
    users: [] as string[],
    cities: [] as string[],
    terminals: [] as string[],
    routes: [] as string[],
  };
  let origin: string;
  let destination: string;
  let unlocated: string;
  let cityA: string;
  let cityB: string;

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
    const email = `routes-${name}-${stamp}@camionera.mx`;
    const res = await call('post', '/users', adminToken)
      .send({ email, fullName: `Prueba ${name}`, password: 'secreta123', role })
      .expect(201);
    ids.users.push(res.body.id);
    return (await login(email, 'secreta123').expect(200)).body
      .accessToken as string;
  };

  const newCity = async (name: string, timezone?: string) => {
    const res = await call('post', '/fleet/cities', adminToken)
      .send({ name: `${name} ${stamp}`, state: 'Prueba', timezone })
      .expect(201);
    ids.cities.push(res.body.id);
    return res.body;
  };

  const newTerminal = async (code: string, cityId: string, located = true) => {
    const res = await call('post', '/fleet/terminals', adminToken)
      .send({
        code: `${code}${tag}`.slice(0, 10),
        name: `Terminal ${code}`,
        cityId,
        ...(located && { latitude: 20.6, longitude: -103.3 }),
      })
      .expect(201);
    ids.terminals.push(res.body.id);
    return res.body.id as string;
  };

  const route = (token: string, body: Record<string, unknown> = {}) =>
    call('post', '/routes', token).send({
      code: `R-${tag}-${ids.routes.length}`,
      name: 'Ruta de prueba',
      originTerminalId: origin,
      destinationTerminalId: destination,
      basePrice: 450,
      estimatedDurationMinutes: 300,
      distanceKm: 350,
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

    coordinatorToken = await newUser('coordinator', 'coordinador');
    vendorToken = await newUser('vendor', 'taquilla');
    hrToken = await newUser('hr', 'rrhh');

    const a = await newCity('Origen');
    const b = await newCity('Destino', 'America/Tijuana');
    cityA = a.id;
    cityB = b.id;
    origin = await newTerminal('RO', cityA);
    destination = await newTerminal('RD', cityB);
    unlocated = await newTerminal('RX', cityB, false);
  });

  afterAll(async () => {
    const recordIds = [
      ...ids.routes,
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
    await prisma.route.deleteMany({ where: { id: { in: ids.routes } } });
    await prisma.terminal.deleteMany({ where: { id: { in: ids.terminals } } });
    await prisma.city.deleteMany({ where: { id: { in: ids.cities } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
  });

  it('la ciudad guarda su zona horaria y rechaza zonas desconocidas', async () => {
    const city = await prisma.city.findUniqueOrThrow({ where: { id: cityB } });
    expect(city.timezone).toBe('America/Tijuana');
    const def = await prisma.city.findUniqueOrThrow({ where: { id: cityA } });
    expect(def.timezone).toBe('America/Mexico_City');
    await call('patch', `/fleet/cities/${cityA}`, adminToken)
      .send({ timezone: 'Europe/Madrid' })
      .expect(400);
  });

  it('coordinación crea una ruta y la clave se guarda en mayúsculas', async () => {
    const res = await route(coordinatorToken, { code: `r-low-${tag}` }).expect(
      201,
    );
    ids.routes.push(res.body.id);
    expect(res.body.code).toBe(`R-LOW-${tag}`);
    expect(res.body.destinationTerminal.city.timezone).toBe('America/Tijuana');
    expect(res.body.stops).toEqual([]);
  });

  it('rechaza clave repetida, origen igual al destino y terminal sin ubicación', async () => {
    await route(coordinatorToken, { code: `R-LOW-${tag}` }).expect(409);
    await route(coordinatorToken, { destinationTerminalId: origin }).expect(
      400,
    );
    const res = await route(coordinatorToken, {
      destinationTerminalId: unlocated,
    }).expect(400);
    expect(JSON.stringify(res.body)).toMatch(/ubicación/);
  });

  it('taquilla consulta y filtra por ciudad, pero no edita; RRHH no entra', async () => {
    const list = await call(
      'get',
      `/routes?originCityId=${cityA}&destinationCityId=${cityB}`,
      vendorToken,
    ).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]._count).toEqual({ stops: 0, schedules: 0 });
    await route(vendorToken).expect(403);
    await call('get', '/routes', hrToken).expect(403);
    const summary = await call('get', '/routes/summary', vendorToken).expect(
      200,
    );
    expect(summary.body.active).toBeGreaterThanOrEqual(1);
  });

  it('no se desactiva una terminal ni una ciudad usada por una ruta activa', async () => {
    await call('patch', `/fleet/terminals/${origin}`, adminToken)
      .send({ isActive: false })
      .expect(400);
    await call('patch', `/fleet/cities/${cityB}`, adminToken)
      .send({ isActive: false })
      .expect(400);
  });

  it('desactivar y reactivar la ruta; al reactivar se revalidan las terminales', async () => {
    const id = ids.routes[0];
    await call('patch', `/routes/${id}`, coordinatorToken)
      .send({ isActive: false })
      .expect(200);
    const inactive = await call(
      'get',
      `/routes?status=inactive&search=${tag}`,
      coordinatorToken,
    ).expect(200);
    expect(inactive.body.data.map((r: { id: string }) => r.id)).toContain(id);

    // Ya sin ruta activa, la terminal se puede desactivar…
    await call('patch', `/fleet/terminals/${origin}`, adminToken)
      .send({ isActive: false })
      .expect(200);
    // …y entonces la ruta no puede reactivarse
    await call('patch', `/routes/${id}`, coordinatorToken)
      .send({ isActive: true })
      .expect(400);
    await call('patch', `/fleet/terminals/${origin}`, adminToken)
      .send({ isActive: true })
      .expect(200);
    const res = await call('patch', `/routes/${id}`, coordinatorToken)
      .send({ isActive: true, basePrice: 480 })
      .expect(200);
    expect(Number(res.body.basePrice)).toBe(480);
  });
});
