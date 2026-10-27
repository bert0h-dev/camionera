import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Requiere la BD de .env y el admin creado con `npm run prisma:seed`
describe('API (e2e)', () => {
  let app: INestApplication<App>;
  const admin = {
    email: process.env.SEED_ADMIN_EMAIL!,
    password: process.env.SEED_ADMIN_PASSWORD!,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health es público', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('ok'));
  });

  it('rutas protegidas requieren token', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('rechaza credenciales inválidas', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: admin.email, password: 'incorrecta' })
      .expect(401);
  });

  it('login, /auth/me y rotación de refresh token', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send(admin).expect(200);
    expect(login.body.user.passwordHash).toBeUndefined();
    const cookie = login.get('Set-Cookie')!;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect((res) => expect(res.body.email).toBe(admin.email));

    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(200);
    // El refresh token anterior ya fue rotado y no se puede reutilizar
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
