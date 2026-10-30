# Módulo 5 · Gestión de Recorridos

Un **recorrido** es un horario de ruta en una fecha concreta (o un extra sin horario), con su unidad, conductor, cobrador opcional y estado. Es lo que vende el Módulo 6.

## Plan aprobado (2026-10-30)

| Fase | Contenido | Estado |
|---|---|---|
| 5.1 | Generación automática, extras, pantalla Recorridos y ficha | ✅ rama `feat/m5-generacion` |
| 5.2 | Asignación de unidad, conductor y cobrador con validaciones | ⏳ |
| 5.3 | Estados, tiempos reales, odómetro, Mis recorridos (conductor), Pendientes | ⏳ |
| 5.4 | Incidencias del recorrido (en `bus_incidents`), avisos y pestaña en Inicio | ⏳ |

Decisiones:
- Fechas en `Timestamptz` (`departure_at`, `arrival_at`), no `date` + `time` como el esquema de `contexto/`: así se representan los viajes que cruzan la medianoche y las zonas horarias. `trip_date` es el día de salida en la zona del origen.
- Sin `available_seats` ni `current_price`: la capacidad sale de los asientos de la unidad y el precio de `segmentPrice` + temporada (M4).
- `delayed` también se permite desde `scheduled` y `boarding` (además de la tabla del contexto).
- Incidencias unificadas con `bus_incidents` (columna `trip_id`); no hay `trip_incidents`.
- Permisos: admin y coordinator gestionan; supervisor y vendor consultan; el driver cambiará el estado de **sus** recorridos y reportará incidencias (5.3–5.4).

## Tablas (migración `trips`, todas las del módulo)
- **`trips`**: `trip_number` legible (`RUTA-AAMMDD-HHMM`, los extras con `-E1`, `-E2`…), `route_schedule_id` (null = extra), `duration_minutes` (copia de la ruta), asignaciones, tiempos y odómetro reales, cancelación y `override_reason`.
  - Único (`route_schedule_id`, `trip_date`): la generación no duplica.
  - **Exclusion constraints** (`btree_gist`): una unidad, un conductor o un cobrador no puede estar en dos recorridos que se encimen, sin contar los cancelados. Prisma no las modela; están en el SQL de la migración. El tiempo de descanso (`trips.unit_turnaround_minutes`, `trips.driver_gap_minutes`) lo valida el servicio en la 5.2.
  - CHECK: la llegada es posterior a la salida.
- **`trip_status_log`**: estado anterior → nuevo, motivo, quién (null = sistema) y cuándo.
- **`bus_incidents.trip_id`** opcional.

## 5.1 Generación
- Reglas puras en `backend/src/trips/trip-rules.ts` (con pruebas): `plannedTrips` usa `runsOn` (M4.5) y `zonedInstant` para interpretar la hora en la zona del origen; `syncPlan` compara lo existente con lo que piden los horarios.
- `TripsService.generate(from, to, routeId?)` es idempotente:
  - Crea lo que falta (`createMany` + `skipDuplicates`) y nunca salidas que ya pasaron.
  - Quita los **programados sin asignar** que ya no corresponden (horario desactivado, hora o duración cambiada, ruta inactiva) y los vuelve a crear con los datos nuevos.
  - Los asignados que ya no coinciden no se tocan: se cuentan como `stale` para revisarlos (Pendientes en la 5.3).
  - Un cancelado ocupa su lugar: esa salida no se vuelve a generar.
- **Automática**: cron cada hora que actúa a la 01:00 de la central; genera de hoy a hoy + `trips.generation_days_ahead` − 1 (14 por defecto, en Parámetros › Recorridos).
- **Al cambiar Rutas**: crear, editar o borrar un horario, o cambiar la duración, la terminal de origen o la activación de una ruta, resincroniza esa ruta dentro del horizonte. `RoutesModule` importa `TripsModule` (no al revés).
- **Borrar un horario**: primero se borran sus recorridos futuros sin asignar; si le quedan otros (asignados, cancelados o pasados), no se puede borrar y hay que desactivarlo.
- **Manual**: botón Generar (hasta 62 días a la vez, opcionalmente una ruta).
- **Extras**: refuerzos o servicios especiales con ruta, fecha, hora local del origen y motivo. Un extra programado y sin asignar se puede borrar; lo demás se cancela.

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/trips?date=&routeId=&status=&unassigned=&search=` | coordinator, supervisor, vendor |
| GET | `/trips/summary?date=` · `/trips/route-options` · `/trips/:id` | coordinator, supervisor, vendor |
| POST | `/trips/generate` · `/trips/extra` | coordinator |
| DELETE | `/trips/:id` (solo extras sin asignar) | coordinator |

## Pantallas
- **Operación › Recorridos** (`/recorridos`): banda con selector de día (`?fecha=`), cifras (del día, sin asignar, en operación, cancelados), filtros por ruta, estado y "solo sin asignar". La salida se muestra en hora del origen y la llegada en hora del destino (`+1` si cae otro día).
- **Ficha** (`/recorridos/:id`): horas locales, unidad y conductor, horario de origen, alta (sistema o usuario) e historial de estados.
- Buscador Ctrl+K: "Recorridos de hoy".

## Datos demo
`seed:demo -- --clean` borra primero los recorridos de rutas, unidades o personal demo. Los recorridos demo se generan solos desde los horarios demo (o con el botón Generar).
