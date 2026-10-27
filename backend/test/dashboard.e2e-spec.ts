import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Requiere la BD de .env y el admin creado con `npx prisma db seed`
describe('Dashboard (e2e)', () => {
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
    await prisma.staff.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ recordId: { in: [...staffIds, ...userIds] } }, { userId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function login(email: string, password: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  }

  const get = (token: string) =>
    request(app.getHttpServer()).get('/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(200);

  it('admin ve los indicadores del equipo y no tiene resumen propio', async () => {
    const res = await get(adminToken);
    expect(res.body.me).toBeNull();
    expect(res.body.team.trend).toHaveLength(7);
    expect(res.body.team.today).toMatchObject({
      scheduled: expect.any(Number),
      missingCheckIn: expect.any(Number),
    });
    expect(res.body.team.documents.alertDays).toBeGreaterThan(0);
  });

  it('un conductor solo ve su resumen del mes', async () => {
    const staff = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Tablero',
        lastName: 'DashboardE2E',
        birthDate: '1985-06-15',
        phone: '5500000004',
        role: 'driver',
        hireDate: '2020-01-01',
      })
      .expect(201);
    staffIds.push(staff.body.id);
    const email = `dash-${stamp}@camionera.mx`;
    await request(app.getHttpServer())
      .post(`/staff/${staff.body.id}/credentials`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, password: 'secreta123' })
      .expect(201);

    const res = await get(await login(email, 'secreta123'));
    expect(res.body.team).toBeNull();
    expect(res.body.me.attendance).toMatchObject({ present: 0, absent: 0 });
  });
});
