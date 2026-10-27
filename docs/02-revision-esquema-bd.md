# Revisión del esquema de BD (`contexto/01-EsquemaBD.prisma`)

**Fecha:** 2026-10-26 · **Estado:** retro enviada, esperando decisiones del usuario

## Preguntas del Módulo 1 que el esquema responde
| # | Pregunta | Respuesta inferida |
|---|---|---|
| 1 | ¿Una o varias empresas? | Una sola (no hay tabla de empresa). |
| 2 | ¿Todo empleado tiene acceso? ¿Clientes con login? | No: `Staff.userId` es opcional. Clientes sin login (`Customer` sin password); `Booking.userId` = quien vendió. |
| 3 | ¿Roles fijos o dinámicos? | Fijos: enum `UserRole` (admin, coordinator, driver, collector, vendor, viewer). |
| 4 | Datos del empleado | Los de `Staff` (sin CURP/RFC/NSS/salario). |
| 6 | Turnos | Por día (`StaffSchedule` único por empleado+fecha) con tipo de turno. |
| 7 | Asistencias | Un registro por día con entrada/salida. |
| 10 | Idioma | Inglés en código/BD (snake_case en tablas). |

Siguen abiertas: 5 (certificaciones/alertas), 8 (nómina), 9 (evaluaciones) — **no hay tablas para ellas**.

## Hallazgos críticos (afectan reglas de negocio)
1. **Doble venta del mismo asiento**: nada impide dos `Booking` activos con el mismo (`tripId`,`seatId`). Propuesta: índice único parcial `WHERE status NOT IN ('cancelled')` vía SQL en la migración.
2. **Fechas/horas de viaje**: `tripDate` (Date) + `scheduledDeparture/Arrival` (Time) no representa viajes que cruzan medianoche ni zonas horarias. Propuesta: `departureAt`/`arrivalAt` como `Timestamptz` (y conservar `tripDate` para filtrar).
3. **Conductor/unidad en dos recorridos simultáneos**: con timestamps se puede garantizar en BD con *exclusion constraint* (`btree_gist` + `tstzrange`), además de la validación en el servicio.
4. **Venta por tramos**: hay paradas intermedias y precio por tramo, pero `Booking` no guarda parada de subida/bajada. ¿Se venden tramos (A→B y B→C reutilizan asiento) o solo origen→destino?
5. **Carrito / compra múltiple**: `Payment` es 1:1 con `Booking` (un asiento). Comprar 3 asientos = 3 pagos. Propuesta: tabla `Order` (compra) que agrupe bookings y tenga el/los pagos.
6. **Generación automática idempotente**: `Trip` no referencia `RouteSchedule`. Propuesta: `routeScheduleId` + único (`routeScheduleId`, `tripDate`).

## Hallazgos de diseño
- `uuid_generate_v4()` requiere extensión `uuid-ossp`; usar `gen_random_uuid()` (nativo) o `@default(uuid(7))`.
- `@db.Timestamp` sin zona → `@db.Timestamptz` en todo.
- Dos enums de rol (`UserRole` y `StaffRole`) que se traslapan; supervisor/mechanic no existen en UserRole y no hay rol RRHH. Definir fuente de verdad.
- Datos duplicados User/Staff (`fullName`, `email`); `Staff.status` + `isActive` redundantes.
- `BusMaintenance.performedBy` apunta a `User`, pero el mecánico es `Staff`.
- Licencia embebida en `Staff` (solo una); faltan certificaciones (examen médico, etc.).
- `SeatType` mezcla posición (ventana/pasillo) con zona (frente/atrás).
- `RouteSchedule.daysOfWeek` como string → `Int[]`.
- `BusSeat.priceModifier` Decimal(5,2): ¿porcentaje o monto?
- Si se cambia el autobús de un trip con boletos vendidos, los `seatId` apuntan al bus anterior.
- Índices redundantes: `@@index` sobre campos ya `@unique` y sobre prefijos de índices compuestos.
- Faltan: refresh tokens (auth), tipo de pasajero (adulto/estudiante/INAPAM/niño), política de cancelación, terminales/andenes, evaluaciones, datos de nómina.
- `DocumentType.dni` → en México INE/CURP.

## Decisiones del usuario (2026-10-26)
- a) **Aceptados** los ajustes de diseño: `uuid(7)`, `Timestamptz`, quitar índices redundantes, `performedBy` → `Staff`.
- b) **Roles**: `UserRole` = permisos en el sistema; `StaffRole` = puesto. Agregar `supervisor` y `hr` a `UserRole`.
- c) Certificaciones, evaluaciones y nómina: **las diseña Claude**.
- Neon conectado (BD vacía). URLs en `backend/.env` (ignorado por git); `DIRECT_URL` = misma URL sin `-pooler`.
- Pendiente para módulos 3–6: venta por tramos, `Order`, terminales/andenes, tipo de pasajero.
