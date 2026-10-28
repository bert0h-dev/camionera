# Módulo 3: Gestión de Flota

**Orden acordado (2026-10-27):** 3.0 catálogos y modelos · 3.1 unidades · 3.2 mantenimientos · 3.3 incidencias · 3.4 combustible. Cada fase va en su propia rama y PR.

## Decisiones del usuario
- **Plantilla de asientos**: cada modelo tiene una plantilla visual (cuadrícula de 1 o 2 pisos) y las unidades heredan una copia.
- **Mantenimiento preventivo**: por km **y** por días, lo que ocurra primero.
- **Incidencias**: también las reporta el conductor.
- **Flota**: solo unidades propias.
- **Terminal**: cada unidad pertenece a una terminal base.
- **Combustible**: hay un catálogo de combustibles y cada modelo indica cuál consume.
- **Terminales con ubicación**: se marcan en un mapa (Leaflet + OpenStreetMap). La ubicación es opcional al guardar, pero **una terminal sin ubicación no se puede usar** en unidades ni rutas.
- **Número económico**: texto libre, sin formato fijo.
- **Cambio de modelo de una unidad**: solo si nunca ha salido a servicio.
- **Aviso de vencimiento de documentos de unidad**: 30 días, configurable.

## Permisos
- **Consultan**: coordinación y supervisión.
- **Editan**: coordinación.
- El admin siempre pasa. RRHH no participa.

## 3.0 Catálogos y modelos ✅ (PR #8)
### Catálogos (`/flota/catalogos`)
Pestañas Terminales, Mapa, Ciudades y Combustibles. Los registros no se borran: se desactivan.
- **Combustibles** (`fuel_types`): el seed base crea Diésel, Gasolina, Gas LP y Gas natural.
- **Ciudades** (`cities`): nombre + estado, únicos juntos.
- **Terminales** (`terminals`):
  - Datos: clave única en mayúsculas, ciudad y dirección.
  - **Ubicación**: `latitude` y `longitude`, `Decimal(9,6)`, siempre juntas.
  - **Selector en el mapa**: clic o arrastrar el marcador.
  - **Buscador**: busca direcciones con Nominatim. Solo consulta al presionar Buscar, por su límite de 1 consulta por segundo.
  - **Dirección automática**: búsqueda inversa al fijar el punto. Llena el campo si está vacío y, si ya tiene texto, la ofrece como sugerencia ("Usar esta").
  - **Utilizables**: `GET /fleet/terminals?located=true` devuelve solo las que tienen ubicación.
  - **Para otros módulos**: `CatalogsService.assertUsableTerminal(id)` rechaza las inactivas o sin ubicación.
- **Pestaña Mapa**: todas las terminales activas con su marcador.
- **Carga**: Leaflet va en un paquete aparte (`vendor-maps`) que solo se descarga al abrir un mapa. En tema oscuro los mosaicos se invierten.

### Modelos de autobús (`/flota/modelos`)
- **Datos**: marca + modelo únicos juntos; tipo (estándar, ejecutivo, lujo o doble piso); combustible; tanque; rendimiento esperado (km/unidad); características; especificaciones; plan preventivo (km y días).
- **Plantilla** (`layout`, JSONB):
  - Forma: `{ floors: [{ rows, cols, cells: [{ r, c, type, number?, category? }] }] }`.
  - Tipos de celda: asiento, pasillo, baño, escalera, conductor, puerta y cafetería.
  - Categorías de asiento: normal, preferente y accesible.
  - Límites: de 1 a 25 filas y de 2 a 7 columnas. Solo el doble piso admite 2 pisos.
- **Validación**: `backend/src/fleet/layout-rules.ts`. Revisa asientos con número y sin repetir, un solo conductor y que esté en el piso 1, y al menos un asiento.
- **Capacidad**: la calcula el servidor (`seatCount`) a partir de la plantilla.
- **Editor visual**: se pinta con clic o arrastrando, hay herramienta de selección para cambiar el número, renumeración, cambio de filas y columnas, y opción de agregar o quitar la planta alta.
  - El cliente tiene una copia de las reglas en `frontend/src/pages/fleet/layout.ts`; el servidor tiene la última palabra.
- **Plantilla inicial**: `GET /fleet/bus-models/default-layout?rows=&floors=` (2 + pasillo + 2).

### Demo
- **Comando**: `npx tsx prisma/seed-demo.ts --fleet` agrega la flota demo **sin tocar al personal demo** y se puede correr varias veces.
- **Contenido**: 4 ciudades con su terminal y coordenadas reales (GDL, CDMXN, LEO, QRO) y 4 modelos (Volvo 9700, Irizar i8, Mercedes-Benz Multego y Volvo 9800 DD).

### Pruebas
- **Unitarias**: `layout-rules.spec.ts`.
- **E2E**: `test/fleet.e2e-spec.ts`. Cubre permisos, layout de 2 pisos rechazado en estándar, capacidad recalculada, ubicación (lat/lng juntas) y `located=true`.

## 3.1 Unidades (rama `feat/m3-unidades`)
### Datos
- **`buses`**:
  - Identificación: número económico (texto libre, único), placas (únicas, 5–15 caracteres), VIN de 17 caracteres sin I/O/Q (único) y año.
  - Relaciones: modelo y terminal base.
  - Operación: odómetro, estado y su motivo, y fecha del último cambio.
  - `first_service_at`: primera vez que la unidad salió a servicio.
  - Plan preventivo propio opcional en km y días; si se deja vacío, usa el del modelo.
- **`bus_seats`**: copia de los asientos del modelo al dar de alta la unidad (piso, fila, columna, número y categoría). Cada asiento se puede bloquear con motivo y fecha.
- **`bus_documents`**:
  - Tipos: seguro, tarjeta de circulación, permiso SICT, verificación y otro.
  - Datos: folio, emisor, expedición y vencimiento opcional.
  - Por ahora sin archivo: el almacenamiento de archivos llega en el Módulo 6.
- **`odometer_readings`**: historial del odómetro con origen (manual, mantenimiento, combustible o recorrido) y quién lo capturó.
- **Parámetro `fleet.document_alert_days`** (30 días): está en Configuración → Parámetros → Flota.

### Reglas (`backend/src/fleet/bus-rules.ts`, con pruebas)
- **Apta**: la unidad no está en mantenimiento ni fuera de servicio, tiene seguro y tarjeta de circulación vigentes hoy (un documento vence al terminar su día) y su terminal base tiene ubicación. Si no es apta, la API devuelve `fit` y la lista de motivos (`reasons`).
- **Salir a servicio** (`in_service`): exige que la unidad sea apta. La primera vez se guarda `first_service_at`.
- **Cambio de modelo**: solo mientras `first_service_at` esté vacío. Al cambiarlo se vuelven a copiar los asientos y se pierden los bloqueos.
- **Motivo obligatorio**: para pasar a mantenimiento o fuera de servicio, y para bloquear un asiento.
- **Odómetro**: nunca baja. `BusesService.recordOdometer(id, km, actor, source)` queda lista para mantenimiento, combustible y recorridos.
- **Terminal base**: tiene que estar activa y con ubicación (`assertUsableTerminal`).
- **Alertas de documentos**: solo cuenta el documento más reciente de cada tipo; los anteriores quedan como historial.
- **Sin borrado**: las unidades no se borran; se pasan a fuera de servicio. Los documentos sí se pueden eliminar, y todo cambio queda en la bitácora.

### API (`/fleet/buses`)
- **Consultas**:
  - `GET /` con filtros por estado, terminal, modelo y búsqueda por número, placas o VIN.
  - `GET /summary` y `GET /expiring-documents`.
  - `GET /:id` y `GET /:id/history`.
- **Cambios**: `POST /`, `PATCH /:id`, `POST /:id/status`, `POST /:id/odometer`, `PATCH /:id/seats/:seatId` y `POST|PATCH|DELETE /:id/documents[/:docId]`.

### Pantallas
- **`/flota/unidades`**:
  - Banda con unidades, disponibles, en mantenimiento, no aptas y documentos con alerta.
  - Filtros y columna "Apta / No apta"; al pasar el cursor se ven los motivos.
- **Detalle** (`/flota/unidades/:id`):
  - Pestañas General, Asientos (clic para bloquear o desbloquear), Documentos e Historial (odómetro y cambios de estado).
  - Botones Odómetro, Cambiar estado y Editar.
- **Alta y edición**: vista previa de los asientos del modelo. Solo aparecen terminales con ubicación, y el modelo queda bloqueado si la unidad ya salió a servicio.
- **Inicio**: panel "Documentos de unidades por vencer" para admin, coordinación y supervisión.
- **Ctrl+K**: acción "Nueva unidad" y búsqueda de unidades por número, placas o VIN.

### Demo y pruebas
- **Demo**: `--fleet` agrega 12 unidades (1001–1012, placas `DEM…`), solo las que falten.
  - Una está en mantenimiento y otra fuera de servicio.
  - Tienen un seguro vencido, dos por vencer y un permiso por vencer.
  - `--clean` las borra.
- **Unitarias**: `bus-rules.spec.ts`.
- **E2E**: `test/buses.e2e-spec.ts`. Cubre alta con terminal ubicada, permisos, apta con documentos, odómetro, bloqueo de asiento, modelo fijo tras salir a servicio y resumen.

## 3.2 Mantenimientos (rama `feat/m3-mantenimientos`)
### Decisiones del usuario
- **Mecánico**: es solo un rol de usuario (`mechanic`), no un empleado de Personal.
- **Costos**: dos importes, mano de obra y refacciones. El detalle de refacciones llegará con inventario.
- **Último servicio**: solo el preventivo lo actualiza; el correctivo no reinicia el conteo.
- **Tareas base del preventivo**: catálogo editable (`maintenance_task_templates`, 10 tareas en el seed base).

### Datos
- **`maintenance_orders`**:
  - Identificación: folio consecutivo (se muestra como OT-000123), unidad, tipo (preventivo o correctivo) y estado (programada, en proceso, terminada o cancelada).
  - Planeación: prioridad (normal o urgente), descripción, fecha programada, taller externo opcional y mecánico (usuario con rol mecánico).
  - Al iniciar: fecha y odómetro de entrada.
  - Al terminar: fecha, odómetro de salida, trabajo realizado, mano de obra y refacciones.
  - Si se cancela: el motivo.
- **`maintenance_tasks`**: lista de tareas de cada orden, que se palomean con fecha.
- **En `buses`**: `last_service_at` y `last_service_km`.
- **Parámetros**: `fleet.maintenance_alert_days` (7) y `fleet.maintenance_alert_km` (1000).

### Reglas
- **Próximo preventivo** (`maintenance-rules.ts`, con pruebas):
  - Se calcula con el último preventivo más el intervalo en km y en días. Manda lo que ocurra primero.
  - Estados: al día, próximo (dentro de los umbrales), vencido o sin plan.
  - Sin preventivo previo, se cuenta desde el alta de la unidad (fecha y primera lectura del odómetro).
  - El plan es el de la unidad o, si no tiene, el del modelo.
- **Iniciar**: registra el odómetro de entrada (origen "mantenimiento"; nunca baja) y pasa la unidad a **en mantenimiento**.
  - No se puede si la unidad está en servicio o fuera de servicio.
  - Si un mecánico inicia una orden sin asignar, se la queda.
- **Terminar**: registra el odómetro de salida (no puede ser menor al de entrada) y los costos.
  - Si la orden es preventiva, actualiza el último servicio.
  - La unidad vuelve a **disponible** si no le queda otra orden en proceso.
- **Cancelar**: con motivo. Si la orden estaba en proceso, la unidad vuelve a disponible.
- **Al crear**:
  - Solo un preventivo abierto por unidad.
  - Los preventivos sin tareas propias copian el catálogo de tareas base.
  - No se puede crear una orden para una unidad fuera de servicio.
- **Mecánico**: solo ve y trabaja sus órdenes o las que no tienen mecánico. Puede iniciar, palomear, agregar tareas y terminar, pero no crear, editar ni cancelar.
- **Permisos de los demás**: coordinación (y admin) hace todo; supervisión consulta.

### API (`/fleet/maintenance`)
- **Plan y catálogos**: `GET plan`, `GET plan/:busId`, `GET summary`, `GET mechanics`, `GET|POST|PATCH task-templates`.
- **Órdenes**:
  - `GET|POST orders`, `GET|PATCH orders/:id`.
  - `POST orders/:id/start|complete|cancel`.
  - `POST orders/:id/tasks` y `PATCH orders/:id/tasks/:taskId`.

### Pantallas
- **`/flota/mantenimiento`**:
  - Banda con preventivos vencidos, próximos, en proceso y gasto del mes.
  - Pestañas **Órdenes**, **Plan preventivo** (con "Programar" en cada unidad) y **Tareas base**.
  - El mecánico ve "Mis órdenes".
- **Detalle de orden** (`/flota/mantenimiento/:id`):
  - Lista de tareas para palomear y agregar.
  - Botones Iniciar, Terminar y Cancelar según el estado y el rol.
  - Al terminar, avisa si quedan tareas sin marcar.
- **Unidad**: pestaña **Mantenimiento** con el próximo preventivo, el botón "Programar preventivo", "Orden correctiva" y el historial de órdenes.
- **Inicio**:
  - Panel "Mantenimiento preventivo" (vencidos y próximos) para admin, coordinación y supervisión.
  - Panel "Mis órdenes de trabajo" para el mecánico.
- **Ctrl+K**: acción "Nueva orden de mantenimiento" (`?nueva=1`) y búsqueda de órdenes por folio (OT-12 o 12).

### Demo y pruebas
- **Demo**: `--fleet` agrega 12 órdenes demo: preventivos terminados con costos, una correctiva urgente en proceso en la unidad 1004 y tres programadas.
  - Si `DEMO_PASSWORD` está en `backend/.env`, también crea el usuario `mecanico@demo.camionera.mx`.
  - `--clean` lo borra.
- **Unitarias**: `maintenance-rules.spec.ts`.
- **E2E**: `test/maintenance.e2e-spec.ts`.
  - Plan desde el alta.
  - Flujo completo con estado de la unidad, odómetro y reinicio del preventivo.
  - Tareas del catálogo y un solo preventivo abierto por unidad.
  - Aislamiento entre mecánicos.
  - El correctivo no reinicia el conteo; cancelación en proceso.
  - Costos del mes.
