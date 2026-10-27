# Central Camionera

Monorepo: `backend/` (NestJS + Prisma + PostgreSQL/Neon) y `frontend/` (React + Vite + Tailwind).

## Inicio
```bash
npm install
cp backend/.env.example backend/.env   # y poner las URLs de Neon
npm run dev                            # back :3000, front :5173
```

- API: http://localhost:3000/api — Swagger: http://localhost:3000/api/docs
- App: http://localhost:5173

## Carpetas
- `contexto/` — memoria/reglas de negocio del proyecto.
- `docs/` — planes y notas de desarrollo.
