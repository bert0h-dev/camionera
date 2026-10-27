import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaExceptionFilter } from './../src/common/filters/prisma-exception.filter.js';
import { createValidationPipe } from './../src/common/validation/validation-pipe.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

interface Score {
  criterionId: string;
  criterionName: string;
  weight: number;
  score: number | null;
}

// Requiere la BD de .env y el admin y criterios creados con `npx prisma db seed`
describe('Evaluations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const staffIds: string[] = [];
  const criterionIds: string[] = [];
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
    const evaluationIds = (await prisma.staffEvaluation.findMany({ where: { staffId: { in: staffIds } } })).map(
      (e) => e.id,
    );
    await prisma.staff.deleteMany({ where: { id: { in: staffIds } } }); // evaluaciones en cascada
    await prisma.evaluationCriterion.deleteMany({ where: { id: { in: criterionIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { recordId: { in: [...staffIds, ...userIds, ...evaluationIds, ...criterionIds] } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function login(email: string, password: string) {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return res.body.accessToken as string;
  }

  function api(token: string, method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) {
    const req = request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }

  async function newStaff(name: string, role: string, withUser = false) {
    const staff = await api(adminToken, 'post', '/staff', {
      firstName: name,
      lastName: 'EvaluacionE2E',
      birthDate: '1985-06-15',
      phone: '5500000003',
      role,
      hireDate: '2020-01-01',
    }).expect(201);
    staffIds.push(staff.body.id);
    if (!withUser) return { id: staff.body.id as string, token: '' };

    const email = `eval-${name.toLowerCase()}-${stamp}@camionera.mx`;
    await api(adminToken, 'post', `/staff/${staff.body.id}/credentials`, { email, password: 'secreta123' }).expect(201);
    return { id: staff.body.id as string, token: await login(email, 'secreta123') };
  }

  it('catálogo: crear, aplicar por puesto y desactivar', async () => {
    const created = await api(adminToken, 'post', '/evaluation-criteria', {
      name: `Criterio mecánico ${stamp}`,
      weight: 4,
      appliesTo: ['mechanic'],
    }).expect(201);
    criterionIds.push(created.body.id);

    await api(adminToken, 'post', '/evaluation-criteria', { name: 'X', weight: 11 }).expect(400);

    const mechanic = await newStaff('Mecanico', 'mechanic');
    const evaluation = await api(adminToken, 'post', '/evaluations', {
      staffId: mechanic.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    }).expect(201);
    const names = (evaluation.body.scores as Score[]).map((s) => s.criterionName);
    expect(names).toContain(`Criterio mecánico ${stamp}`);
    expect(names).not.toContain('Manejo seguro');

    await api(adminToken, 'patch', `/evaluation-criteria/${created.body.id}`, { isActive: false }).expect(200);
    const active = await api(adminToken, 'get', '/evaluation-criteria').expect(200);
    expect(active.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('ciclo completo: borrador, calificar, finalizar y enterado', async () => {
    const driver = await newStaff('Chofer', 'driver', true);
    const created = await api(adminToken, 'post', '/evaluations', {
      staffId: driver.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    }).expect(201);
    const id = created.body.id as string;
    const scores = created.body.scores as Score[];
    expect(scores.map((s) => s.criterionName)).toContain('Manejo seguro');

    // Traslape con el mismo empleado
    await api(adminToken, 'post', '/evaluations', {
      staffId: driver.id,
      periodStart: '2026-06-01',
      periodEnd: '2026-12-31',
    }).expect(409);

    // El empleado no ve borradores
    let mine = await api(driver.token, 'get', '/evaluations/me').expect(200);
    expect(mine.body).toHaveLength(0);

    // Calificación parcial: no se puede finalizar
    await api(adminToken, 'patch', `/evaluations/${id}`, {
      scores: [{ criterionId: scores[0].criterionId, score: 4 }],
    }).expect(200);
    await api(adminToken, 'post', `/evaluations/${id}/finalize`).expect(400);
    await api(adminToken, 'patch', `/evaluations/${id}`, {
      scores: [{ criterionId: scores[0].criterionId, score: 6 }],
    }).expect(400);

    // Todo en 4 excepto el primero en 5
    const full = await api(adminToken, 'patch', `/evaluations/${id}`, {
      scores: scores.map((s, i) => ({ criterionId: s.criterionId, score: i === 0 ? 5 : 4, comment: 'ok' })),
      strengths: 'Responsable',
    }).expect(200);
    const totalWeight = scores.reduce((t, s) => t + s.weight, 0);
    const expected = Math.round(((4 * totalWeight + scores[0].weight) / totalWeight) * 100) / 100;
    expect(Number(full.body.overallScore)).toBe(expected);

    await api(adminToken, 'post', `/evaluations/${id}/finalize`).expect(201);
    await api(adminToken, 'patch', `/evaluations/${id}`, { comments: 'tarde' }).expect(400);
    await api(adminToken, 'delete', `/evaluations/${id}`).expect(400);

    const detail = await api(adminToken, 'get', `/evaluations/${id}`).expect(200);
    expect(detail.body.status).toBe('finalized');
    expect(detail.body.attendance).toMatchObject({ absent: 0 });

    mine = await api(driver.token, 'get', '/evaluations/me').expect(200);
    expect(mine.body).toHaveLength(1);
    await api(driver.token, 'get', '/evaluations').expect(403);

    const ack = await api(driver.token, 'post', `/evaluations/me/${id}/acknowledge`, {
      employeeComment: 'De acuerdo',
    }).expect(201);
    expect(ack.body.status).toBe('acknowledged');
    await api(driver.token, 'post', `/evaluations/me/${id}/acknowledge`, {}).expect(400);
  });

  it('supervisor evalúa a otros pero no a sí mismo; borrador se puede borrar', async () => {
    const supervisor = await newStaff('Supervisor', 'supervisor', true);
    const vendor = await newStaff('Taquillero', 'vendor');

    await api(supervisor.token, 'post', '/evaluations', {
      staffId: supervisor.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    }).expect(403);

    const created = await api(supervisor.token, 'post', '/evaluations', {
      staffId: vendor.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    }).expect(201);
    expect(created.body.evaluator.id).toBeDefined();

    // El supervisor no administra el catálogo
    await api(supervisor.token, 'post', '/evaluation-criteria', { name: 'No permitido' }).expect(403);

    await api(supervisor.token, 'delete', `/evaluations/${created.body.id}`).expect(204);
    await api(adminToken, 'get', `/evaluations/${created.body.id}`).expect(404);
  });
});
