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
| 4.1 | Rutas: CRUD, clave única, activar y desactivar, zona horaria en ciudades | ✅ esta rama |
| 4.2 | Horarios: días de la semana, vigencia, sin choques; llegada en hora local | ⏳ |
| 4.3 | Paradas: orden, tiempo desde el origen, precio adicional, mapa del recorrido | ⏳ |
| 4.4 | Temporadas globales y cálculo del precio vigente | ⏳ |
| 4.5 | Búsqueda entre ciudades (directas y por tramo) para taquilla | ⏳ |

## Esquema (una sola migración en la 4.1: `20261028191101_routes`)
- `cities.timezone` (nuevo campo).
- `routes`: `code` único, `name`, `originTerminalId`, `destinationTerminalId`, `basePrice`, `estimatedDurationMinutes`, `distanceKm`, `description`, `isActive`.
- `route_stops`: `routeId`, `terminalId`, `stopOrder`, `durationFromOriginMinutes`, `additionalPrice`. Únicos `(routeId, stopOrder)` y `(routeId, terminalId)`. Se borran en cascada con la ruta.
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
- **Detalle** (`/rutas/:id`): datos, terminales con su hora local y desfase, ejemplo de horario (salida 08:00 → llegada en hora del destino) y mapa con el trazo origen → paradas → destino. Las pestañas Paradas y Horarios aparecen deshabilitadas hasta la 4.2 y 4.3.
- **Modal de ruta**: propone el nombre a partir de las ciudades y avisa cuando la ruta une dos zonas horarias.
- **Catálogos › Ciudades**: nuevo selector de zona horaria y columna con la hora local actual.
- **Buscador Ctrl+K**: acción "Nueva ruta" (`/rutas?nueva=1`) para admin y coordinación.

### Datos demo
- Nuevas terminales HMO (Hermosillo, `America/Hermosillo`), TIJ (Tijuana, `America/Tijuana`) y MZT (Mazatlán, `America/Mazatlan`).
- 8 rutas con clave `DEM-…`, una de ellas inactiva. `--clean` las borra y `-- --routes` las carga solas.
- Las ciudades que no son demo quedan en `America/Mexico_City`; hay que revisar las que estén en otra zona (por ejemplo Mexicali → `America/Tijuana`).
