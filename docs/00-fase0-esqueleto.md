# Fase 0 — Esqueleto del proyecto

**Estado:** ✅ Completada (2026-10-26)

## Decisiones
- Monorepo con **npm workspaces** (`backend`, `frontend`).
- Backend: **NestJS 11 (ESM)** + **Prisma 7.10.1** (estable; `latest` en npm era una RC de v8, se descartó).
- Base de datos: **PostgreSQL en Neon**. Prisma 7 usa driver adapter `@prisma/adapter-pg`.
  - `DATABASE_URL` → conexión *pooled* (app, runtime).
  - `DIRECT_URL` → conexión directa (migraciones, vía `prisma.config.ts`).
- Frontend: **React + Vite + TypeScript + Tailwind v4**, React Router, TanStack Query, Axios.
- `contexto/`: memoria del proyecto que llena el usuario. `docs/`: planes y notas de Claude.

## Lo que quedó
- `GET /api/health`, Swagger en `/api/docs`, prefijo `/api`, CORS, ValidationPipe global.
- `PrismaModule` global (sin modelos todavía).
- Frontend con página inicial que consulta `/api/health` vía proxy de Vite.
- Test e2e de health pasando.

## Pendiente
- Cadena de conexión de Neon → llenar `backend/.env` (copiar de `.env.example`).
- Definir dominio a partir de `contexto/` → primeros modelos y migración.
