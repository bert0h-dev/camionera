# Andenes

Cada terminal tiene sus **andenes** y cada recorrido sale de uno de su terminal de origen. El horario trae un **andén habitual** que heredan los recorridos al generarse; en cada recorrido se puede cambiar antes de que salga. Se ve en la taquilla, el boleto, el abordaje, el manifiesto y un **tablero de salidas** para pantallas de la central.

Rama `feat/andenes`.

## Datos (migración `platforms`)
- Tabla **`platforms`**: terminal, clave (`code`, hasta 10, p. ej. `1` o `A3`), nombre opcional y activo. Clave única por terminal. No se borran: se desactivan.
- `route_schedules.platform_id` (opcional): andén habitual en la terminal de origen.
- `trips.platform_id` (opcional, índice con `departure_at`) y `trips.platform_override_reason`: motivo cuando un admin fuerza un andén ocupado.

## Reglas (`backend/src/trips/platform-rules.ts`, con pruebas)
- Un andén está **ocupado** desde `trips.platform_boarding_minutes` (30 por defecto, Parámetros › Recorridos) antes de la salida hasta la salida.
- Dos recorridos no cancelados no pueden encimar esa ventana en el mismo andén. Es **override**, como las horas de manejo: solo un admin lo fuerza y con motivo. Lo que ya estaba asignado se respeta.
- El andén debe ser de la **terminal de origen** de la ruta y estar **activo** (bloqueo).
- Solo se cambia mientras el recorrido no sale: programado, abordando o retrasado, y sin salida real.
- **Generación**: los recorridos nuevos copian el andén habitual del horario. Al cambiar el andén habitual de un horario, sus recorridos futuros programados que seguían el anterior toman el nuevo (sin revisar choques, igual que la generación).
- El andén solo aplica a quien **sube en el origen**: en una parada intermedia no se muestra (taquilla, boleto y correo).
- Todo cambio va a la bitácora (`platforms` y `trips`).

## Pantallas
- **Flota › Catálogos › Terminales**: botón *Andenes* por terminal; modal con la lista, alta, edición y activar o desactivar. Edita coordinación (y admin); supervisión consulta.
- **Rutas › ficha › Horarios**: columna *Andén* y campo *Andén habitual* en el alta y la edición (andenes activos del origen; opcional).
- **Recorridos**: columna *Andén* en la lista. En la ficha, dato *Andén de salida*, botón *Asignar / Cambiar andén* (modal que marca los ocupados con el recorrido que los ocupa y pide motivo al admin para forzar) y aviso si el andén se forzó.
- **Taquilla**: el andén en cada salida y en la banda del mapa de asientos. **Ventas**: en el detalle de la compra.
- **Abordaje**: el andén junto a la unidad; el **manifiesto PDF** lo lleva en *Unidad / andén*.
- **Boleto PDF**: fila *Unidad / andén*; el **correo** de los boletos dice de qué andén sale.
- **Operación › Tablero de salidas** (`/recorridos/tablero`): salidas de una terminal desde 15 min atrás hasta 6 h adelante (máximo 30) con hora, destino y paradas, andén, estado (Programado, Abordando, Retrasado, Salió, Cancelado) y unidad. Recuerda la terminal elegida en el navegador, se actualiza cada 30 s y tiene **pantalla completa** (tablero oscuro con reloj). Lo ven coordinación, supervisión, taquilla, conductores y cobradores.
- **Inicio › Pendientes** (área *Rutas y recorridos*, admin, coordinator y supervisor): "Sin andén" para recorridos que salen en las próximas 2 h sin andén.

## API

| Método | Ruta | Roles | Qué hace |
|---|---|---|---|
| GET | `/fleet/terminals/:id/platforms?includeInactive=` | coordinator, supervisor, vendor | Andenes de una terminal |
| POST | `/fleet/terminals/:id/platforms` | coordinator | Alta `{ code, name? }` |
| PATCH | `/fleet/platforms/:id` | coordinator | Cambia `code`, `name` o `isActive` |
| POST/PATCH | `/routes/:id/schedules[/:scheduleId]` | coordinator | Aceptan `platformId` (o `null`) |
| GET | `/trips/:id/platforms` | coordinator | Andenes del origen con sus choques en la ventana del viaje |
| PATCH | `/trips/:id/platform` | coordinator | `{ platformId: uuid \| null, overrideReason? }` |
| GET | `/trips/departures-board?terminalId=` | coordinator, supervisor, vendor, driver, collector | Tablero; sin terminal (o una sin rutas) usa la primera y siempre regresa las terminales de origen |

Admin entra a todo. Las listas y fichas de recorridos, los horarios, la búsqueda de salidas de taquilla, el mapa de asientos y el manifiesto devuelven el andén (`{ id, code, name }` o su clave).

## Datos demo
- `npm run seed:demo -w backend -- --platforms`: andenes `1`–`6` en las 7 terminales demo, reparte los horarios demo sin andén entre ellos por hora de salida (por terminal, para no encimarse) y pone el andén a los recorridos de esos horarios que no lo tengan. Es idempotente y no cambia andenes ya puestos.
- También corre al cargar la flota (`--fleet`) y las rutas (`--routes`); la semilla de ventas (`--sales`) copia el andén del horario a los recorridos que crea.
- `--clean` borra los andenes `1`–`6` de las terminales demo que ya nadie usa.
- Cargado el 2026-10-30: 42 andenes, 17 horarios y 1,084 recorridos con andén.
