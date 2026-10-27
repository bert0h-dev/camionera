# Fase 1.4 — Asistencias

**Estado:** ✅ Completada (2026-10-27)

## Decisiones del usuario (valores por defecto aceptados)
- Registro: captura manual (supervisor/RRHH) + **autoregistro** desde la app para empleados con usuario. QR/reloj checador: después.
- Tolerancia 10 min · medio día < 50 % · extras desde 30 min · entrada hasta 60 min antes. Configurables.
- Cierre automático diario 02:00 (`@nestjs/schedule`).
- Estados: `present`, `late`, `half_day`, `absent`, `excused`. Las horas extra son `overtime_minutes`, no un estado.

## Base de datos (migración `add_staff_attendance`)
- `staff_attendance`: uno por empleado y día (día del turno), `schedule_id` (null = sin turno), `check_in_at`/`check_out_at` timestamptz, `status`, `late_minutes`, `worked_minutes`, `overtime_minutes`, `source` (manual/self/system), `recorded_by` (null = sistema), `notes` (historial de correcciones).

## Backend
- Cálculo puro en `attendance-rules.ts` (`computeAttendance`): retardo tras tolerancia; medio día gana sobre retardo; extras desde el fin del turno solo si pasan el umbral; sin turno = presente sin retardo/extras.
- Autoregistro (`/attendance/me/*`, cualquier usuario ligado a empleado): `today`, `check-in`, `check-out`. Usa la hora del servidor. Entrada solo con turno vigente y dentro de la ventana; salida cierra la entrada abierta de ayer u hoy.
- Supervisión (admin/hr/supervisor): `POST /attendance` (captura; 409 si ya existe), `PATCH /attendance/:id` (motivo obligatorio, se acumula en notas). Horas "HH:mm" locales; salida ≤ entrada = día siguiente; sin entrada = falta; `excused` = justificada.
- Consultas: `GET /attendance` (rango ≤ 62 días), `GET /attendance/day` (turnos del día + registros, incluye quien registró sin turno), `GET /attendance/summary` (admin/hr; base para nómina).
- Cierre: `POST /attendance/close-day` (admin/hr, solo días pasados, idempotente) y cron diario 02:00 CDMX del día anterior. Vacaciones/incapacidad → justificada automática.

## Frontend
- Menú **Asistencias**: vista por día con turno, entrada, salida, estado, retardo/trabajado/extra; Registrar/Corregir (con motivo); **Cerrar día** en días pasados.
- Inicio: tarjeta **Mi turno** con Registrar entrada / salida (solo usuarios ligados a empleado).
- Ficha del empleado: pestaña **Asistencias** mensual con resumen (asistencias, retardos, medios días, faltas, justificadas, horas extra).

## Tests
- Unit (6): a tiempo, tolerancia exacta, medio día, umbral de extras, nocturno, sin turno.
- E2E: autoregistro completo, duplicado 409, salida sin entrada 400, sin turno 400, cierre (no hoy; faltas y justificadas; idempotente), corrección sin motivo 400 / con motivo recalcula, resumen, captura duplicada 409.
- E2E con timeout de 30 s (Neon remoto).
