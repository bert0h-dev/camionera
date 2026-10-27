# Fase 1.2 — Licencias y certificaciones

**Estado:** ✅ Completada (2026-10-27)

## Decisiones del usuario
- Solo datos por ahora (sin archivos escaneados; queda pendiente almacenamiento S3/R2).
- Conductor apto = licencia **tipo A** vigente + **examen médico** vigente.
- Alerta de vencimiento: 30 días por defecto, **configurable**.

## Base de datos (migración `add_staff_documents`)
- `staff_licenses`: tipo (A–E), número (único por empleado), expedida por, expedición, vencimiento, notas.
- `staff_certifications`: tipo (medical_exam, first_aid, defensive_driving, training, other), nombre, emisor, folio, expedición, vencimiento opcional (null = no vence), notas.
- `system_settings` (de tu esquema; `updated_by` es FK a users).
- Renovar = registrar un documento nuevo; el anterior queda como historial.

## Backend
- Estado calculado (no guardado): `valid` / `expiring` / `expired` + `daysToExpiry`. Un documento es válido hasta el final del día de vencimiento. "Hoy" se calcula en `America/Mexico_City` (`common/dates.ts`).
- Rutas (`StaffDocumentsController`, registrado antes que `StaffController` para que `/staff/expirations` no choque con `/staff/:id`):
  - `GET /staff/:id/licenses|certifications`, `POST` igual — lectura: admin/hr/supervisor/coordinator; escritura: admin/hr.
  - `PATCH|DELETE /staff/licenses/:id`, `/staff/certifications/:id`.
  - `GET /staff/expirations?days=` — vencidos o por vencer de personal no dado de baja; omite los ya renovados (mismo empleado y tipo con vencimiento posterior).
  - `GET /staff/:id/compliance` → `{ compliant, missing[] }`.
- `StaffDocumentsService.isDriverCompliant(staffId, fecha)` exportado para el Módulo 4.
- No se modifican documentos de un empleado dado de baja.
- **Settings** (`/api/settings`, solo admin): registro tipado de parámetros con default (`settings.registry.ts`); `GET` lista, `PATCH /settings/:key` valida tipo y rango y audita. Primer parámetro: `documents.expiry_alert_days`.

## Frontend
- Ficha del empleado: pestaña **Licencias** activa (licencias + certificaciones, modales de alta/edición, eliminar con confirmación).
- Avisos en la ficha: conductor no apto (lo que le falta) y documentos vencidos sin reemplazo.
- Inicio: panel **Documentos del personal por vencer** (admin/hr/supervisor/coordinator); el admin puede cambiar los días de alerta desde ahí.

## Tests
- Unit: estado del documento (límites inclusive, vence hoy, sin vencimiento) e `isValidOn`.
- E2E: alta/edición/validación de licencias, número duplicado 409, cumplimiento del conductor, vencimientos con filtro de renovados y `days`, eliminar certificación.

## Pendiente / notas
- Archivos adjuntos (cuando haya almacenamiento).
- El bundle del front pasa de 500 kB → conviene carga diferida de páginas (lazy routes) más adelante.
