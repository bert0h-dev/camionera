# Fase 1.3 — Turnos y horarios

**Estado:** ✅ Completada (2026-10-27)

## Decisiones del usuario (valores por defecto aceptados)
- Límites: **14 h** por turno (sin descansos), **8 h** de descanso entre turnos (NOM-087-SCT), **48 h** por semana lunes–domingo (LFT). Configurables en `system_settings`.
- Aplican a **todos** los empleados.
- **Bloquear** si se rompen; solo un **admin** puede forzar, con motivo obligatorio que se guarda en `override_reason` y en auditoría.

## Base de datos (migración `add_staff_schedules`)
- `shift_templates`: nombre único, tipo, `start_time`/`end_time` ("HH:mm" local; fin ≤ inicio = día siguiente), descanso en minutos, activo.
- `staff_schedules`: un registro por empleado y día (`schedule_date`), `start_at`/`end_at` **timestamptz** (null en descanso), tipo, descanso, `is_rest_day`, plantilla, notas, `override_reason`, `created_by`.
- Seed crea plantillas Matutino (06–14), Vespertino (14–22) y Nocturno (22–06).

## Backend
- Horas locales → UTC con `zonedDateTime()` (zona `America/Mexico_City`, en `common/dates.ts`).
- Reglas puras en `schedule-rules.ts` (`validateSchedule`, `workedHours`): duración máxima, empalmes, descanso con el turno anterior **y** el siguiente, horas semanales.
- `GET /schedules?from&to&staffId&role` (máx. 62 días) — admin/hr/supervisor/coordinator; incluye `workedHours`.
- `POST`, `PATCH`, `DELETE /schedules` — admin/hr/**supervisor**.
- `POST /schedules/bulk` — empleados × rango × días de la semana con plantilla o descanso; guarda los válidos y devuelve `skipped` con motivo; `replace` para sobrescribir.
- `GET/POST/PATCH /shift-templates` — escritura admin/hr.
- `SchedulesService.isOnShift(staffId, desde, hasta)` exportado para el Módulo 4.
- `GET /staff?activeOnly=true` excluye dados de baja (para el calendario).

## Frontend
- Menú **Turnos**: calendario semanal (empleados × días), filtro por puesto (conductores por defecto), navegación de semanas, total de horas (rojo si excede el máximo), clic en celda para crear/editar/eliminar, **Asignar en bloque** con resumen de rechazados, **Plantillas** (admin/hr).
- Si la API rechaza por reglas, el modal muestra los motivos; el admin puede forzar escribiendo el motivo.
- Ficha del empleado: pestaña **Turnos** con su semana.

## Tests
- Unit (10): zona horaria, horas trabajadas, máximo por turno, descanso antes/después, descanso exacto, empalmes, semana lunes–domingo, día de descanso.
- E2E: turno desde plantilla, duplicado 409, descanso insuficiente 400, forzar sin motivo 400 / con motivo 201, asignación masiva parcial.
- Los e2e ahora corren **en serie** (`fileParallelism: false`) porque comparten la BD.
- Verificado por rol: supervisor programa (201) pero no fuerza (403) ni crea plantillas (403); coordinador lee (200) pero no programa (403).

## Pendiente
- Conducción continua (5 h → 30 min) se valida en el Módulo 4 contra los recorridos.
