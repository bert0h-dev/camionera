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
  let midA: string;
  let midB: string;
  let cityA: string;
  let cityB: string;

  const call = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
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
    midA = await newTerminal('RM', cityA);
    midB = await newTerminal('RN', cityB);
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

  describe('horarios', () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
    }).format(new Date());
    const plus = (days: number) =>
      new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000)
        .toISOString()
        .slice(0, 10);
    const url = () => `/routes/${ids.routes[0]}/schedules`;
    const pendingIds = async () =>
      (
        await call('get', '/dashboard/pending', coordinatorToken).expect(200)
      ).body.map((p: { id: string }) => p.id) as string[];

    it('sin horarios vigentes aparece en Pendientes', async () => {
      expect(await pendingIds()).toContain(
        `route-unscheduled-${ids.routes[0]}`,
      );
    });

    it('alta de varias horas a la vez con días ordenados y llegada en hora local', async () => {
      const res = await call('post', url(), coordinatorToken)
        .send({
          departureTimes: ['10:00', '06:30'],
          daysOfWeek: [5, 1, 2, 3, 4],
          validFrom: today,
        })
        .expect(201);
      expect(
        res.body.map((s: { departureTime: string }) => s.departureTime),
      ).toEqual(['06:30', '10:00']);
      expect(res.body[0].daysOfWeek).toEqual([1, 2, 3, 4, 5]);

      const list = await call('get', url(), vendorToken).expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body[0].status).toBe('current');
      // 300 min del centro a Tijuana: 10:30 o 11:30 en hora local según el horario de verano
      expect(['10:30', '11:30']).toContain(list.body[0].arrivalTime);
      expect(await pendingIds()).not.toContain(
        `route-unscheduled-${ids.routes[0]}`,
      );

      const routes = await call(
        'get',
        `/routes?search=${tag}`,
        vendorToken,
      ).expect(200);
      expect(routes.body.data[0]._count.schedules).toBe(2);
    });

    it('rechaza choques, horas repetidas, sin días y vigencia invertida; si una choca no guarda ninguna', async () => {
      const clash = await call('post', url(), coordinatorToken)
        .send({
          departureTimes: ['07:00', '10:00'],
          daysOfWeek: [5, 6],
          validFrom: plus(3),
        })
        .expect(400);
      expect(JSON.stringify(clash.body)).toMatch(/10:00/);
      expect((await call('get', url(), coordinatorToken)).body).toHaveLength(2);

      const bad = [
        {
          departureTimes: ['07:00', '07:00'],
          daysOfWeek: [1],
          validFrom: today,
        },
        { departureTimes: ['07:00'], daysOfWeek: [], validFrom: today },
        { departureTimes: ['25:00'], daysOfWeek: [1], validFrom: today },
        {
          departureTimes: ['07:00'],
          daysOfWeek: [1],
          validFrom: plus(5),
          validUntil: plus(1),
        },
      ];
      for (const body of bad)
        await call('post', url(), coordinatorToken).send(body).expect(400);

      // A la misma hora pero en fin de semana no choca
      await call('post', url(), coordinatorToken)
        .send({
          departureTimes: ['10:00'],
          daysOfWeek: [0, 6],
          validFrom: today,
          validUntil: plus(3),
        })
        .expect(201);
    });

    it('el horario por vencer sale en Pendientes; editar, desactivar y borrar', async () => {
      const list = (await call('get', url(), coordinatorToken).expect(200))
        .body as { id: string; validUntil: string | null }[];
      const weekend = list.find((s) => s.validUntil)!;
      expect(await pendingIds()).toContain(`route-expiring-${weekend.id}`);

      const one = `${url()}/${weekend.id}`;
      // Pasarlo a lunes choca con el de entre semana
      await call('patch', one, coordinatorToken)
        .send({ daysOfWeek: [1] })
        .expect(400);
      await call('patch', one, coordinatorToken)
        .send({ isActive: false })
        .expect(200);
      const after = (await call('get', url(), coordinatorToken)).body.find(
        (s: { id: string }) => s.id === weekend.id,
      );
      expect(after.status).toBe('inactive');
      await call('delete', one, vendorToken).expect(403);
      await call('delete', one, coordinatorToken).expect(204);
      expect((await call('get', url(), coordinatorToken)).body).toHaveLength(2);
    });
  });

  describe('paradas', () => {
    const url = () => `/routes/${ids.routes[0]}/stops`;
    // La ruta de prueba: 300 min y precio base 480 (después de la edición)
    const stop = (
      terminalId: string,
      legKm: number,
      min: number,
      price: number,
    ) => ({
      terminalId,
      legKm,
      durationFromOriginMinutes: min,
      priceFromOrigin: price,
    });

    it('guarda el itinerario, acumula km y calcula la distancia de la ruta', async () => {
      const res = await call('put', url(), coordinatorToken)
        .send({
          stops: [stop(midA, 100, 90, 150), stop(midB, 80.5, 200, 320)],
          finalLegKm: 60,
        })
        .expect(200);
      expect(
        res.body.stops.map((s: { stopOrder: number }) => s.stopOrder),
      ).toEqual([1, 2]);
      expect(
        res.body.stops.map((s: { kmFromOrigin: string }) =>
          Number(s.kmFromOrigin),
        ),
      ).toEqual([100, 180.5]);
      expect(Number(res.body.distanceKm)).toBe(240.5);
    });

    it('con paradas no se edita la distancia ni se deja la duración o el precio por debajo de la última parada', async () => {
      const route = `/routes/${ids.routes[0]}`;
      await call('patch', route, coordinatorToken)
        .send({ distanceKm: 999 })
        .expect(400);
      await call('patch', route, coordinatorToken)
        .send({ estimatedDurationMinutes: 200 })
        .expect(400);
      await call('patch', route, coordinatorToken)
        .send({ basePrice: 300 })
        .expect(400);
      await call('patch', route, coordinatorToken)
        .send({ estimatedDurationMinutes: 310 })
        .expect(200);
    });

    it('reordenar invierte el orden; rechaza tiempos, precios, terminales y faltantes inválidos', async () => {
      const bad = [
        { stops: [stop(midA, 100, 90, 150)] }, // falta el último tramo
        { stops: [stop(origin, 100, 90, 150)], finalLegKm: 10 },
        {
          stops: [stop(midA, 100, 90, 150), stop(midA, 10, 100, 160)],
          finalLegKm: 10,
        },
        {
          stops: [stop(midA, 100, 200, 150), stop(midB, 10, 100, 160)],
          finalLegKm: 10,
        },
        { stops: [stop(midA, 100, 90, 500)], finalLegKm: 10 },
        { stops: [stop(unlocated, 100, 90, 150)], finalLegKm: 10 },
      ];
      for (const body of bad)
        await call('put', url(), coordinatorToken).send(body).expect(400);

      const res = await call('put', url(), coordinatorToken)
        .send({
          stops: [stop(midB, 50, 60, 100), stop(midA, 50, 120, 200)],
          finalLegKm: 50,
        })
        .expect(200);
      expect(res.body.stops[0].terminal.id).toBe(midB);
      expect(Number(res.body.distanceKm)).toBe(150);
    });

    it('la terminal de una parada no se puede desactivar; taquilla no edita; sin paradas la distancia es el tramo directo', async () => {
      await call('patch', `/fleet/terminals/${midA}`, adminToken)
        .send({ isActive: false })
        .expect(400);
      await call('put', url(), vendorToken).send({ stops: [] }).expect(403);
      const res = await call('put', url(), coordinatorToken)
        .send({ stops: [], finalLegKm: 333 })
        .expect(200);
      expect(res.body.stops).toEqual([]);
      expect(Number(res.body.distanceKm)).toBe(333);
      const cleared = await call('put', url(), coordinatorToken)
        .send({ stops: [] })
        .expect(200);
      expect(cleared.body.distanceKm).toBeNull();
    });
  });
});
