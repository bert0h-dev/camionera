# Fase 1.1 — Empleados

**Estado:** ✅ Completada (2026-10-27)

## Base de datos (migración `add_staff`)
- Tabla `staff` + enums `StaffRole` (driver, collector, mechanic, supervisor, vendor, hr, admin_staff) y `StaffStatus`.
- Nombre separado: `first_name`, `last_name` (paterno), `second_last_name` (materno).
- `curp`, `rfc`, `nss` opcionales y únicos. `user_id` opcional y único (acceso al sistema).
- Número de empleado `EMP-000001` desde la secuencia `staff_employee_number_seq` (creada a mano en la migración; el servicio hace `nextval` dentro de la transacción del alta).
- `User.fullName` se conserva y se sincroniza con el nombre del empleado cuando está ligado.

## Backend (`/api/staff`)
| Endpoint | Roles |
|---|---|
| `GET /staff`, `GET /staff/:id` | admin, hr, supervisor, coordinator |
| `POST /staff`, `PATCH /staff/:id` | admin, hr |
| `POST /staff/:id/terminate` | admin, hr — baja lógica, desactiva usuario y revoca sesiones |
| `POST /staff/:id/credentials` | admin, hr — crea `User` ligado |

- Rol de sistema sugerido por puesto (`staff-roles.ts`); RRHH solo puede asignar el sugerido.
- Validaciones: CURP/RFC (persona física)/NSS/teléfono 10 dígitos; ≥18 años al contratar; baja no anterior a contratación; no se edita un empleado dado de baja; `status: inactive` solo vía `terminate`.
- En edición, enviar `null` borra un campo opcional.
- Búsqueda multi-palabra (cada palabra debe coincidir con nombre, apellidos, número, CURP o teléfono).

## Transversal
- `createValidationPipe()` traduce al español los mensajes por defecto de class-validator.

## Frontend
- Menú **Personal** (admin, hr, supervisor, coordinator).
- `/personal` lista con filtros; `/personal/:id` ficha con pestañas (General activa; Licencias, Turnos, Asistencias, Evaluaciones, Nómina deshabilitadas hasta fases 1.2–1.6).
- `/personal/nuevo` y `/personal/:id/editar` (solo admin/hr): formulario por secciones, mayúsculas automáticas en CURP/RFC, solo dígitos en NSS/teléfonos.
- Modales: Dar acceso (rol fijo al sugerido para RRHH) y Dar de baja.

## Tests
- Unit: mapeo puesto→rol, restricción de RRHH, regex de CURP/RFC/NSS.
- E2E: número consecutivo, normalización de teléfono, CURP duplicada → 409, mensajes en español, edad mínima, dar acceso → login OK, baja → login 401. Limpian sus datos.
- Verificado manualmente: RRHH no puede asignar admin (403); supervisor lee (200) pero no crea (403) ni ve usuarios (403).
