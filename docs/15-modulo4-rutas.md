# Módulo 4: Gestión de Rutas

**Inicio:** 2026-10-28

## Decisiones aprobadas
- **Terminal a terminal.** Origen, destino y paradas son terminales activas con ubicación. La búsqueda por ciudad pasa por `terminal.city`.
- **Zona horaria en la ciudad** (`cities.timezone`, formato IANA, por defecto `America/Mexico_City`). Todas las terminales de una ciudad comparten la zona.
  - La hora de salida de un horario se interpreta en la zona de la terminal de origen.
  - La llegada (y la de cada parada) se calcula sumando la duración al instante de salida y se muestra en la zona de la terminal de destino. Así se respetan las diferencias entre estados y el horario de verano de la frontera.
- **Temporadas globales**: aplican a todas las rutas y no se solapan entre las activas.
- **Precio final redondeado a peso entero** (se aplica en la 4.4).
- **Roles**: `admin` y `coordinator` administran; `supervisor` y `vendor` (taquilla) consultan.
- Respecto a `contexto/01-EsquemaBD.prisma`: mismas tablas, pero ligadas a terminales en lugar de ciudades, `daysOfWeek` como `Int[]`, `route_pricing` pasa a `seasons` globales, fechas en `timestamptz` y uuid v7.

## Fases

| Fase | Contenido | Estado |
| :-: | --- | :-: |
| 4.1 | Rutas: CRUD, clave única, activar y desactivar, zona horaria en ciudades | ✅ PR #17 |
| 4.2 | Horarios: días de la semana, vigencia, sin choques; llegada en hora local | ✅ PR #18 |
| 4.3 | Paradas: km por tramo, tiempo y precio desde el origen; la distancia de la ruta se calcula | ✅ PR #19 |
| 4.4 | Temporadas globales y cálculo del precio vigente | ✅ esta rama |
| 4.5 | Búsqueda entre ciudades (directas y por tramo) para taquilla | ⏳ |

## Esquema (migración `20261028191101_routes` en la 4.1; `20261028195738_route_stops_km` en la 4.3)
- `cities.timezone` (nuevo campo).
- `routes`: `code` único, `name`, `originTerminalId`, `destinationTerminalId`, `basePrice`, `estimatedDurationMinutes`, `distanceKm` (opcional desde la 4.3; con paradas es la suma de los tramos), `description`, `isActive`.
- `route_stops`: `routeId`, `terminalId`, `stopOrder`, `durationFromOriginMinutes`, `kmFromOrigin` (acumulado) y `priceFromOrigin` (precio del boleto del origen hasta la parada; en la 4.3 reemplazó a `additionalPrice`). Únicos `(routeId, stopOrder)` y `(routeId, terminalId)`. Se borran en cascada con la ruta.
- `route_schedules`: `routeId`, `departureTime` (`time`, hora local del origen), `daysOfWeek Int[]` (0 = domingo), `validFrom`, `validUntil?`, `isActive`. Cascada con la ruta.
- `seasons`: `name`, `seasonType` (enum `SeasonType`: low, normal, high, holiday), `validFrom`, `validUntil`, `priceModifierPercent`, `description`, `isActive`.
- Las tablas de paradas, horarios y temporadas ya existen; sus pantallas llegan en 4.2–4.4.

## 4.1 Rutas

### Reglas (`backend/src/routes/route-rules.ts`, con pruebas)
- El origen y el destino deben ser terminales distintas, activas y con ubicación (`CatalogsService.assertUsableTerminal`).
- Al **reactivar** una ruta se vuelven a validar ambas terminales.
- El origen o el destino no puede ser también una parada de la misma ruta.
- Las rutas no se borran; se desactivan (los recorridos del Módulo 5 las referirán).
- No se puede desactivar una terminal o una ciudad que use una ruta activa (origen, destino o parada), ni quitarle la ubicación a una terminal en ese caso.
- Funciones de zona horaria sin dependencias (`Intl`): `zonedInstant`, `wallTime`, `offsetMinutes`, `localArrival`. Los tests cubren CDMX, Cancún (+1 h y cambio de día), Hermosillo → Tijuana en invierno y verano, y el día del cambio de horario en Tijuana.

### API (`/api/routes`)
| Método | Ruta | Roles |
| --- | --- | --- |
| GET | `/routes/summary` | lectores |
| GET | `/routes/form-options` | editores (terminales activas con ubicación) |
| GET | `/routes?search&originCityId&destinationCityId&status=active\|inactive\|all&sort` | lectores |
| GET | `/routes/:id` | lectores (incluye paradas y horarios) |
| POST | `/routes` | editores |
| PATCH | `/routes/:id` | editores (también activa y desactiva) |

Cada alta y cambio queda en la bitácora (`routes`).

### Pantallas
- **Rutas** (`/rutas`, nuevo grupo "Rutas" en el menú): banda con rutas activas, ciudades conectadas, kilómetros de red y precio base promedio; filtros por texto, ciudad de origen, ciudad de destino y estado. Las rutas que cruzan de zona llevan la etiqueta "Cambia de zona".
- **Detalle** (`/rutas/:id`): datos, terminales con su hora local y desfase, ejemplo de horario (salida 08:00 → llegada en hora del destino) y mapa con el trazo origen → paradas → destino. Desde la 4.3 la pestaña Paradas muestra el itinerario.
- **Modal de ruta**: propone el nombre a partir de las ciudades y avisa cuando la ruta une dos zonas horarias.
- **Catálogos › Ciudades**: nuevo selector de zona horaria y columna con la hora local actual.
- **Buscador Ctrl+K**: acción "Nueva ruta" (`/rutas?nueva=1`) para admin y coordinación.

### Datos demo
- Nuevas terminales HMO (Hermosillo, `America/Hermosillo`), TIJ (Tijuana, `America/Tijuana`) y MZT (Mazatlán, `America/Mazatlan`).
- 8 rutas con clave `DEM-…`, una de ellas inactiva. `--clean` las borra y `-- --routes` las carga solas.
- Las ciudades que no son demo quedan en `America/Mexico_City`; hay que revisar las que estén en otra zona (por ejemplo Mexicali → `America/Tijuana`).

## 4.2 Horarios

### Reglas (`backend/src/routes/schedule-rules.ts`, con pruebas)
- La hora de salida (`HH:mm`) es hora local de la terminal de origen. La llegada se calcula con `localArrival` y se muestra en hora del destino, con "(+1)" si llega al día siguiente. Para tomar bien el horario de verano se calcula en hoy o, si el horario aún no empieza, en su primer día de vigencia.
- Días: al menos uno, de 0 (domingo) a 6, sin repetir; se guardan ordenados.
- Vigencia: inicio obligatorio, fin opcional (vacío = indefinida) y no anterior al inicio.
- **Sin choques**: dos horarios activos de la misma ruta no pueden tener la misma hora con algún día en común y vigencias que se crucen. El error dice con cuál choca. Uno inactivo no choca.
- Situación calculada en la fecha local del origen: Vigente, Próximo, Vencido o Inactivo.
- El alta acepta varias horas con los mismos días y vigencia, en una transacción: si una choca no se guarda ninguna.
- Se pueden borrar mientras no haya recorridos; en el Módulo 5, un horario con recorridos solo se podrá desactivar.

### API
| Método | Ruta | Roles |
| --- | --- | --- |
| GET | `/routes/:id/schedules` | lectores (con `status`, `arrivalTime`, `arrivalDayOffset`) |
| POST | `/routes/:id/schedules` | editores (`departureTimes[]`, `daysOfWeek`, `validFrom`, `validUntil?`) |
| PATCH | `/routes/:id/schedules/:scheduleId` | editores (también activa y desactiva) |
| DELETE | `/routes/:id/schedules/:scheduleId` | editores |

- `GET /routes` cuenta en `_count.schedules` solo los horarios vigentes hoy. `GET /routes/summary` agrega `weeklyDepartures`.

### Pantallas
- **Detalle de ruta › Horarios** (`?tab=schedules` la abre directo): tabla con salida, llegada, días (chips L M M J V S D), vigencia y situación. Los vencidos e inactivos se ocultan hasta pedirlos. La vista **Semana** muestra las salidas vigentes de cada día y marca los días sin salidas.
- **Modal**: varias horas (con la llegada calculada al lado), días con atajos Diario / Lunes a viernes / Fin de semana, y vigencia.
- La banda del detalle y la de la lista muestran **Salidas por semana**. En la lista, una ruta activa sin horarios vigentes lleva la etiqueta "sin horarios".

### Inicio y parámetros
- Pendientes, área **Rutas** (admin y coordinación): "Ruta sin horarios" (activa y sin salidas vigentes; si tiene horarios futuros dice cuándo empiezan) y "Horario por vencer" según `routes.schedule_expiry_alert_days` (7 días).
- Parámetros: nuevo módulo **Rutas** con el grupo "Horarios de ruta".

### Datos demo
- 17 salidas en 6 rutas, vigentes desde hace 30 días. León – Querétaro vence en 5 días y Guadalajara – Mazatlán queda sin horarios; las dos aparecen en Pendientes.

## 4.3 Paradas

### Decisiones
- **Precio desde el origen**: cada parada guarda el precio del boleto del origen hasta ella; el destino usa el precio base. Quien sube en un punto y baja en otro paga la diferencia (`segmentPrice`). Ejemplo GDL → CDMX: León $390, Querétaro $620, destino $820; León → Querétaro = $230.
- **Km por tramo**: se capturan los km de cada tramo (origen → parada 1 → … → última parada → destino). Cada parada guarda sus km acumulados (`kmFromOrigin`) y la **distancia de la ruta es la suma de los tramos**.
  - Sin paradas, la distancia es opcional y se captura en el modal de la ruta o como el tramo directo del itinerario.
  - Con paradas, el modal la bloquea ("se calcula con las paradas") y la API rechaza cambiarla.

### Reglas (`backend/src/routes/stop-rules.ts`, con pruebas)
- La parada es una terminal activa con ubicación (solo se revisa si es nueva en el itinerario), distinta del origen y del destino, y sin repetirse.
- Tiempo desde el origen creciente y menor que la duración de la ruta; precio creciente, mayor a 0 y menor que el precio base; km del tramo mayores a 0.
- Con paradas, el último tramo hasta el destino es obligatorio.
- Al editar la ruta con paradas, la duración y el precio base no pueden quedar por debajo de los de la última parada. Al reactivarla se revisan también las terminales de las paradas.

### API
- `PUT /routes/:id/stops` (editores): `{ stops: [{ terminalId, legKm, durationFromOriginMinutes, priceFromOrigin }], finalLegKm }`. Reemplaza el itinerario en una transacción, recalcula `distanceKm` y devuelve la ruta con sus paradas. Bitácora en `route_stops`.
- Las paradas se leen con `GET /routes/:id` (no hay un GET aparte).

### Pantalla (detalle de ruta › Paradas, `?tab=stops`)
- **Itinerario** vertical Origen → paradas → Destino con km, precio y hora de llegada en la hora local de cada terminal para la salida elegida (selector con los horarios vigentes).
- **Precio por tramo**: matriz sube × baja con la diferencia de precios.
- **Editar**: cada parada como tramo "de X a Y" con terminal, km del tramo (muestra el acumulado), horas y minutos desde la salida y precio desde el origen; subir, bajar y quitar; último tramo hasta el destino y la distancia total calculada al momento.

### Datos demo
- GDL → CDMX por León (220 km, 3 h 20, $390) y Querétaro (410 km, 5 h 30, $620), 625 km en total; el regreso CDMX → GDL por Querétaro y León.

## 4.4 Temporadas

### Decisiones
- **Globales**: aplican a todas las rutas. Dos temporadas activas no pueden cruzarse en fechas (extremos incluidos).
- **Cuenta la fecha del viaje**, no la de compra: un boleto comprado hoy para Navidad paga la tarifa de Navidad.
- **Signo obligatorio según el tipo**: baja resta, alta y vacaciones/festivo suman, normal = 0 %. El ajuste va de −90 % a +200 %.
- **Precio = redondeo a peso entero de (precio sin temporada × (1 + % / 100))**. En un tramo se aplica a la diferencia de precios desde el origen, así un tramo no depende del redondeo de otro. Sin temporada, el precio de la ruta también se redondea.
- Las temporadas que ya terminaron no se borran (solo se desactivan) para conservar el historial.

### Reglas (`backend/src/routes/season-rules.ts`, con pruebas)
`seasonErrors` (fechas, rango y signo), `findSeasonClash`, `seasonStatus` (Vigente, Próxima, Pasada, Inactiva), `seasonOn` (temporada de una fecha) y `applySeason` (redondeo).

### API
| Método | Ruta | Roles |
| --- | --- | --- |
| GET | `/seasons?year=` | lectores (con `status` y `canDelete`) |
| GET | `/seasons/summary` | lectores (vigente y próxima) |
| POST, PATCH, DELETE | `/seasons`, `/seasons/:id` | editores |
| GET | `/routes/:id/fares?date=` | lectores: temporada de la fecha, puntos del itinerario, cada tramo con `base` y `price`, y `fullFare` |

### Pantallas
- **Temporadas** (`/rutas/temporadas`, en el menú Rutas): banda con la vigente, la próxima, las del año y los días con ajuste; **calendario anual** con barras por tipo y la línea de hoy; tabla con acciones; modal que propone el signo según el tipo y muestra un ejemplo ($820 → precio ajustado).
- **Detalle de ruta**: la banda muestra **Precio hoy** con la temporada aplicada y el precio base en la nota. En Paradas, **Precio por tramo** tiene un selector de fecha del viaje y muestra el precio ajustado con el base tachado.
- **Ctrl+K**: acción "Nueva temporada".
- El menú lateral marca solo el elemento más específico (Temporadas, no Rutas, en `/rutas/temporadas`).

### Datos demo
Baja de otoño (−10 %, 1 oct–30 nov 2026, vigente hoy), Navidad y Año Nuevo (+25 %), Semana Santa 2027 (+20 %) y Verano 2027 (+10 %). Se reconocen por la descripción "Demo · …" y `--clean` las borra.
