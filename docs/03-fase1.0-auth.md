# Fase 1.0 — Base y autenticación

**Estado:** ✅ Completada (2026-10-27)

## Base de datos (migración `init_auth`)
`users`, `refresh_tokens`, `password_resets`, `audit_logs`. Enums `UserRole` (con `supervisor` y `hr`) y `ActionType`.
Convenciones: `uuid(7)`, `Timestamptz`, snake_case.

## Backend
- **Auth** (`/api/auth`): `login`, `refresh`, `logout`, `me`, `change-password`.
  - Access token JWT (15 min) en header `Authorization: Bearer`.
  - Refresh token aleatorio (7 días) en cookie httpOnly `refresh_token` (path `/api/auth`), guardado como SHA-256.
  - Rotación en cada refresh; reutilizar un token revocado cierra **todas** las sesiones del usuario.
  - Contraseñas con argon2id. Cambiar contraseña / desactivar / cambiar rol revoca sesiones.
- **Guards globales**: `JwtAuthGuard` (todo protegido salvo `@Public()`) y `RolesGuard` (`@Roles(...)`, admin siempre pasa).
- **Users** (`/api/users`, solo admin): listar (paginación, búsqueda, filtro rol/activo), ver, crear, editar, reset de contraseña. Un admin no puede desactivarse ni quitarse el rol.
- **Auditoría**: `AuditService.log()` llamado desde los servicios (guarda valores antes/después). Se eligió explícito en vez de interceptor porque el interceptor no conoce los valores anteriores.
- `PrismaExceptionFilter`: P2002→409, P2025→404, P2003→409.
- `PrismaService` omite `passwordHash` en todas las consultas por defecto.
- Seed: `npm run prisma:seed -w backend` crea el admin de `SEED_ADMIN_*`.

## Frontend
- `AuthProvider` + `useAuth`; access token en memoria, recuperación de sesión con la cookie al recargar.
- Interceptor axios: en 401 hace un refresh (una sola petición aunque fallen varias) y reintenta.
- `ProtectedRoute` por sesión y rol; `AppLayout` con menú lateral filtrado por rol (responsive).
- Páginas: Login, Inicio, Usuarios (tabla, búsqueda, filtro, alta/edición, contraseña, activar/desactivar).
- UI: `Button`, `Input`, `Select`, `Modal`, `Table` + `Pagination`, `Toast`.

## Tests
- Unit: `RolesGuard`. E2E (contra Neon, requiere seed): health público, 401 sin token, credenciales inválidas, login + me + rotación.

## Notas
- Se usó `@nestjs/jwt` directo en vez de Passport (menos dependencias, mismo resultado).
- `@hookform/resolvers@5` (v6 tiene conflicto de peer deps).
- Mensajes de validación de class-validator siguen en inglés → pendiente traducir.
