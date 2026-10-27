# Módulo 1 — Gestión de Personal (plan propuesto)

**Estado:** 🚧 En curso — 1.0 ✅ (ver 03-fase1.0-auth.md); siguiente: 1.1 Empleados
**Fuente:** `contexto/00-importante.md`

## Observación clave
El paso 2 del flujo 2.1.4 ("Sistema crea credenciales de acceso según permisos") hace que el
Módulo 1 dependa de `auth` + `users` + roles. Por eso se arranca con una base mínima de
autenticación (parte del Módulo 2) y luego se construye Personal encima.

## Fases
- **1.0 Base**: `common` (filtros de error, paginación, DTOs base), `auth` (login JWT access+refresh,
  guards, decorador `@Roles`/`@Permissions`), `users` mínimo, seed de admin inicial.
  Frontend: login, layout de panel admin (sidebar), rutas protegidas.
- **1.1 Empleados**: CRUD de empleados (`staff`), puesto/rol, alta de credenciales al registrar.
- **1.2 Licencias y certificaciones**: tipos, vigencias, alertas de vencimiento.
- **1.3 Turnos y horarios**: programación de turnos, validación de horas máximas de conducción.
- **1.4 Asistencias**: registro entrada/salida.
- **1.5 Evaluaciones de desempeño**.
- **1.6 Datos para nómina**: salario base, tipo de pago, cálculo de nómina base desde asistencias.

Cada fase: modelos Prisma + migración, módulo Nest (controller/service/DTOs + Swagger + tests),
pantallas React. Se presenta plan detallado y se espera aprobación antes de cada una.

## Preguntas abiertas
Ver respuesta en la conversación; registrar aquí las respuestas.

## Preguntas enviadas al usuario (2026-10-26) — PENDIENTES
1. ¿Una sola empresa o multi-empresa?
2. Usuarios vs empleados: ¿todo empleado tiene login? ¿Clientes con cuenta o invitados?
3. Roles: ¿fijos (conductor, cobrador, vendedor, admin, RRHH, supervisor) o dinámicos con permisos configurables?
4. Datos del empleado (CURP, RFC, NSS, dirección, contacto emergencia, fecha ingreso, terminal/sucursal…).
5. Licencias: tipos (federal A/B/E, examen médico) y días de anticipación para alertas.
6. Turnos: ¿fijos o por día? ¿Límite de conducción (NOM-087-SCT)?
7. Asistencias: ¿manual, reloj checador, QR/app?
8. Nómina: ¿solo datos para exportar o cálculo (por día/viaje/comisión, extras)?
9. Evaluaciones: criterios y periodicidad.
10. Idioma: código/BD en inglés, UI en español.

Mínimo para planear fases 1.0 y 1.1: preguntas 1, 2, 3, 4 y 10.
