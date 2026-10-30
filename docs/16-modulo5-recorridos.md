# Módulo 5 · Gestión de Recorridos

Un **recorrido** es un horario de ruta en una fecha concreta (o un extra sin horario), con su unidad, conductor, cobrador opcional y estado. Es lo que vende el Módulo 6.

## Plan aprobado (2026-10-30)

| Fase | Contenido | Estado |
|---|---|---|
| 5.1 | Generación automática, extras, pantalla Recorridos y ficha | ✅ fusionada (PR #23) |
| 5.2 | Asignación de unidad, conductor y cobrador con validaciones; Pendientes | ✅ fusionada (PR #24) |
| 5.3 | Estados, tiempos reales, odómetro, Mis recorridos (conductor) | ✅ rama `feat/m5-estados` |
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
  - Los asignados que ya no coinciden no se tocan: se cuentan como `stale` y aparecen en Pendientes (5.2).
  - Un cancelado ocupa su lugar: esa salida no se vuelve a generar.
- **Automática**: cron cada hora que actúa a la 01:00 de la central; genera de hoy a hoy + `trips.generation_days_ahead` − 1 (14 por defecto, en Parámetros › Recorridos).
- **Al cambiar Rutas**: crear, editar o borrar un horario, o cambiar la duración, la terminal de origen o la activación de una ruta, resincroniza esa ruta dentro del horizonte. `RoutesModule` importa `TripsModule` (no al revés).
- **Borrar un horario**: primero se borran sus recorridos futuros sin asignar; si le quedan otros (asignados, cancelados o pasados), no se puede borrar y hay que desactivarlo.
- **Manual**: botón Generar (hasta 62 días a la vez, opcionalmente una ruta).
- **Extras**: refuerzos o servicios especiales con ruta, fecha, hora local del origen y motivo. Un extra programado y sin asignar se puede borrar; lo demás se cancela.

## 5.2 Asignación
- Reglas puras en `backend/src/trips/assignment-rules.ts` (con pruebas). Cada observación tiene un nivel:
  - **block**: no se puede asignar.
  - **override**: rompe un límite de horas; solo un **admin** lo fuerza escribiendo un motivo (`trips.override_reason`, visible en la ficha). El motivo se borra si cambia el conductor.
  - **warn**: se asigna, pero se avisa.
- **Unidad**: reutiliza `busFitness` de Flota con la **fecha del viaje** (no en mantenimiento ni fuera de servicio; seguro y tarjeta de circulación vigentes ese día). Bloquea sin asientos y con otro recorrido encimado contando `trips.unit_turnaround_minutes`. Avisa si su recorrido anterior termina en otra terminal o, si no tiene, si su base no es el origen.
- **Conductor**: rol `driver`, activo (no vacaciones, incapacidad, suspensión ni baja), licencia vigente hasta la llegada y sin encimarse contando `trips.driver_gap_minutes`. Pasar `schedules.max_shift_hours` sumando los recorridos de ese día es **override**. Si tiene descanso programado ese día, solo avisa.
- **Cobrador** (opcional): rol `collector`, activo, sin encimarse. No puede ser la misma persona que el conductor.
- Solo se valida lo que cambia; lo ya asignado se respeta. Se puede cambiar mientras el recorrido está programado, abordando o retrasado (antes de salir).
- Si dos personas asignan al mismo tiempo, las exclusion constraints de la base rechazan la segunda (409 con mensaje claro).
- La asignación no cambia el estado de la unidad; eso llega con los estados en la 5.3.
- **Pendientes** (área *Rutas y recorridos*), para admin, coordinator y supervisor:
  - Sin unidad o conductor que salen en las próximas 24 h (urgente a menos de 6 h).
  - Unidad asignada que pasó a mantenimiento o fuera de servicio.
  - Asignados cuyo horario cambió o se desactivó (solo admin y coordinator).
  - La hora se muestra en la de la terminal de origen, igual que en Recorridos.

## 5.3 Estados
- Máquina de estados en `backend/src/trips/status-rules.ts` (con pruebas):

| Desde | Puede pasar a |
|---|---|
| scheduled | boarding, delayed, cancelled |
| boarding | in_transit, delayed, cancelled |
| in_transit | completed, delayed |
| delayed | antes de salir: boarding, in_transit, cancelled · ya en ruta: in_transit, completed |
| completed, cancelled | — (finales) |

- **Abordar**: pide unidad y conductor, y se abre `trips.boarding_open_minutes` antes de la salida (30 por defecto, Parámetros › Recorridos).
- **Salir**: registra la hora real (`actual_departure_at`) y, opcional, el odómetro de salida. La unidad pasa a **en servicio** (y se guarda `first_service_at` si es la primera vez). Una unidad en mantenimiento o fuera de servicio no puede abordar ni salir.
- **Retrasar** y **cancelar** piden motivo, que queda en el historial. Ya en ruta no se puede cancelar.
- **Terminar**: registra la llegada real y exige el odómetro de llegada (no menor al de salida ni al de la unidad). La unidad regresa a **disponible** si seguía en servicio (si una incidencia la sacó de servicio, se respeta).
- Las lecturas de odómetro se guardan en Flota con origen `trip`.
- Cada cambio queda en `trip_status_log` y en la bitácora.
- **Cancelar** libera la unidad y al personal (las exclusion constraints no cuentan los cancelados). `onTripCancelled` queda como gancho para que el Módulo 6 cancele los boletos.
- **Conductor**: solo opera **sus** recorridos y no puede cancelar. Conductor y cobrador solo ven la ficha de sus propios recorridos.
- **Pendientes**: recorridos que debieron salir hace más de 15 min y siguen programados o abordando, y los que debieron llegar hace más de una hora y no se han cerrado.

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/trips?date=&routeId=&status=&unassigned=&search=` | coordinator, supervisor, vendor |
| GET | `/trips/summary?date=` · `/trips/route-options` · `/trips/:id` | coordinator, supervisor, vendor |
| POST | `/trips/generate` · `/trips/extra` | coordinator |
| GET | `/trips/:id/candidates` (unidades, conductores y cobradores con sus observaciones) | coordinator |
| PUT | `/trips/:id/assignment` (`busId`, `driverId`, `collectorId`; null = quitar; `overrideReason` solo admin) | coordinator |
| PATCH | `/trips/:id/status` (`status`, `reason`, `startOdometerKm`, `endOdometerKm`) | coordinator; driver en los suyos |
| GET | `/trips/mine?date=` | driver, collector |
| DELETE | `/trips/:id` (solo extras sin asignar) | coordinator |

## Pantallas
- **Operación › Recorridos** (`/recorridos`): banda con selector de día (`?fecha=`), cifras (del día, sin asignar, en operación, cancelados), filtros por ruta, estado y "solo sin asignar". La salida se muestra en hora del origen y la llegada en hora del destino (`+1` si cae otro día).
- **Ficha** (`/recorridos/:id`): horas locales, unidad y conductor, horario de origen, alta (sistema o usuario) e historial de estados. Botón **Asignar / Cambiar asignación**: un modal con unidad, conductor y cobrador. Las opciones no aptas salen deshabilitadas con su motivo; debajo de cada selección se ven sus avisos.
- Botones de estado en la banda de la ficha: abrir abordaje, registrar salida y llegada, marcar retraso y cancelar. Los que piden datos abren un diálogo. La ficha muestra la salida real (con los minutos de retraso), la llegada real y los km recorridos.
- **Operación › Mis recorridos** (`/mis-recorridos`, conductor y cobrador): tarjetas del día con horas, unidad y los botones de estado (solo el conductor). Se refresca cada minuto.
- Buscador Ctrl+K: "Recorridos de hoy".

## Datos demo
`seed:demo -- --clean` borra primero los recorridos de rutas, unidades o personal demo. Los recorridos demo se generan solos desde los horarios demo (o con el botón Generar).
