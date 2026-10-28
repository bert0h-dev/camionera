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
- **Ciudades** (`cities`): nombre + estado, únicos juntos. El catálogo de terminales y ciudades tiene buscador (sin acentos) y paginado de 20 en pantalla; los selectores de otras pantallas siguen recibiendo la lista completa. Desde el Módulo 4 llevan zona horaria (ver doc 15) y no se pueden desactivar si una ruta activa las usa (igual que las terminales).
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
  - Pestañas General, Asientos (clic para bloquear o desbloquear), Documentos, Mantenimiento (3.2), Incidencias (3.3) e Historial (odómetro y cambios de estado).
  - Botones Odómetro, Cambiar estado y Editar.
- **Alta y edición**: vista previa de los asientos del modelo. Solo aparecen terminales con ubicación, y el modelo queda bloqueado si la unidad ya salió a servicio.
- **Inicio**: los documentos de unidades vencidos o por vencer aparecen en **Pendientes** para admin, coordinación y supervisión (antes era un panel propio; ver doc 13).
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
  - No se puede si la unidad está en servicio. Fuera de servicio solo se inician correctivos (cambio de la 3.3).
  - Si un mecánico inicia una orden sin asignar, se la queda.
- **Terminar**: registra el odómetro de salida (no puede ser menor al de entrada) y los costos.
  - Si la orden es preventiva, actualiza el último servicio.
  - La unidad vuelve a **disponible** si no le queda otra orden en proceso; si tiene una incidencia crítica abierta, queda **fuera de servicio** (3.3).
  - Si la orden nació de una incidencia, la resuelve con el trabajo realizado (3.3).
- **Cancelar**: con motivo. Si la orden estaba en proceso, la unidad se libera con la misma regla que al terminar.
- **Al crear**:
  - Solo un preventivo abierto por unidad.
  - Los preventivos sin tareas propias copian el catálogo de tareas base.
  - Una unidad fuera de servicio solo admite órdenes correctivas (desde la 3.3, para atender incidencias críticas).
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
- **Inicio** (ver doc 13):
  - Los preventivos vencidos y próximos aparecen en **Pendientes** para admin, coordinación y supervisión.
  - La pestaña **Flota** muestra el estado del taller.
  - El mecánico ve la sección "Mis órdenes de trabajo".
- **Parámetros**: `fleet.maintenance_alert_days` y `fleet.maintenance_alert_km` están en Configuración → Parámetros → Flota → "Alertas de flota".
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

## 3.3 Incidencias (rama `feat/m3-incidencias`)
### Decisiones del usuario
- **Categorías**: catálogo editable (`incident_categories`, 7 en el seed base). La casilla "Es accidente" pide los datos del siniestro.
- **Gravedad crítica**: la unidad sale de servicio en automático.
- **Fotos**: se agregan cuando exista el almacenamiento de archivos (Módulo 6).
- **Accidentes**: número de siniestro, aseguradora o ajustador, si hubo terceros y si hubo lesionados.

### Datos
- **`bus_incidents`** (folio INC-000123):
  - Unidad, categoría, gravedad (baja, media, alta, crítica), descripción, lugar, fecha y hora del suceso, odómetro opcional y quién reporta.
  - Estado: reportada → en revisión → resuelta o descartada.
  - Atención: revisor y fecha, fecha de cierre y nota de resolución.
  - `took_bus_out`: la incidencia es la que mantiene la unidad fuera de servicio.
- **`maintenance_orders.incident_id`**: la incidencia de la que nació la orden.

### Reglas (`incident-rules.ts`, con pruebas)
- **Quién**: reportan coordinación, supervisión, conductor y mecánico. El conductor y el mecánico solo ven lo suyo y pueden corregir su reporte mientras nadie lo revise. Supervisión y coordinación toman, resuelven y descartan; solo coordinación crea la orden y edita categorías.
- **Crítica**: una unidad disponible o en servicio pasa a fuera de servicio. Si se baja la gravedad, se regresa.
- **Orden correctiva** desde la incidencia: con la unidad, la descripción y prioridad urgente si es alta o crítica. La incidencia pasa a en revisión. Mientras la orden esté abierta, la incidencia no se cierra a mano.
- **Al terminar la orden**: la incidencia se resuelve sola con el trabajo realizado.
- **Liberar la unidad** (orden terminada o incidencia cerrada): vuelve a disponible solo si no le queda otra crítica abierta; si le queda, sigue fuera de servicio a nombre de esa otra incidencia.
- **Cambio en 3.2**: una unidad fuera de servicio ya admite órdenes **correctivas** (crearlas e iniciarlas); los preventivos siguen bloqueados.

### API (`/fleet/incidents`)
- `GET|POST /`, `GET|PATCH /:id`, `GET summary`, `GET buses` (unidades para elegir al reportar).
- `POST /:id/review|resolve|dismiss|order`.
- `GET|POST categories`, `PATCH categories/:id`.

### Pantallas
- **`/flota/incidencias`**: banda con abiertas, críticas, en revisión y resueltas del mes; pestañas **Incidencias** (abiertas por defecto, filtros por estado, gravedad y categoría) y **Categorías**. El conductor y el mecánico ven "Mis incidencias".
- **Detalle** (`/flota/incidencias/:id`): reporte, datos del siniestro, órdenes ligadas y seguimiento; botones Editar, Tomar, Crear orden correctiva, Resolver y Descartar según el rol y el estado.
- **Unidad**: pestaña **Incidencias** con el historial y "Reportar incidencia".
- **Orden de trabajo**: muestra la incidencia de origen.
- **Inicio**: las abiertas entran en Pendientes ("Urgente" si son altas o críticas) con cuánto llevan abiertas.
- **Ctrl+K**: acción "Reportar incidencia" (`?nueva=1`) y búsqueda por folio (INC-12 o 12).

### Demo y pruebas
- **Demo**: `--fleet` agrega 4 incidencias: una crítica sin revisar (unidad fuera de servicio), una en revisión ligada a la orden de aire acondicionado y dos cerradas (una, accidente con siniestro).
- **Unitarias**: `incident-rules.spec.ts`.
- **E2E**: `test/incidents.e2e-spec.ts`: alcance del conductor, datos de siniestro, crítica → orden → resuelta y disponible, dos críticas abiertas y bajar la gravedad.

## 3.4 Combustible (rama `feat/m3-combustible`)
### Decisiones del usuario
- **Rendimiento**: se mide de **tanque lleno a tanque lleno**. Las cargas parciales se suman al siguiente lleno; el primer lleno solo abre la medición.
- **Precio**: se captura en cada carga porque cambia por día. El formulario propone el último precio usado de ese combustible.
- **Cargas del conductor**: entran **por confirmar**. Coordinación las confirma o las rechaza con motivo. Mientras están pendientes no mueven el odómetro ni cuentan en gasto, rendimiento ni alertas.
- **Alerta**: rendimiento 15 % o más por debajo del esperado del modelo, en el parámetro `fleet.fuel_efficiency_alert_pct` (Alertas de flota).

### Datos
- **`fuel_loads`**:
  - Unidad, combustible (el del modelo al momento de la carga), fecha y hora, cantidad, precio por unidad, total, odómetro, tanque lleno o parcial, estación, ticket y notas.
  - Estado: por confirmar, confirmada o rechazada (con motivo), quién registró y quién revisó.
  - Medida del tramo, solo en tanques llenos que cierran uno: `trip_km`, `trip_quantity` y `efficiency` (km por unidad del combustible).

### Reglas (`fuel-rules.ts`, con pruebas)
- **Validación**: cantidad y precio positivos, sin pasar el tanque del modelo, y el odómetro tiene que ser mayor al de la última carga confirmada de la unidad. Al confirmar una pendiente se vuelve a validar.
- **Odómetro**: al confirmarse, la carga avanza el odómetro de la unidad si es mayor (lectura con origen `fuel`).
- **Recalcular**: cada alta, corrección, confirmación o borrado vuelve a medir todas las cargas confirmadas de la unidad.
- **Corregir o eliminar**: la pendiente, quien la registró o coordinación; la confirmada, solo coordinación y solo si es la última de la unidad (la lista marca `isLastConfirmed`). Las rechazadas no se tocan. El odómetro nunca regresa.
- **Rendimiento bajo**: se juzga con la última medición de cada unidad.

### Permisos
- **Registran**: coordinación (confirmadas) y el conductor (por confirmar, solo ve las suyas).
- **Consultan**: supervisión ve todo pero no registra.
- **Confirman y rechazan**: coordinación. El admin siempre pasa; RR. HH. y mecánico no participan.

### API (`/fleet/fuel`)
- `GET /` (filtros por estado, unidad, terminal, fechas y búsqueda por unidad, estación o ticket), `GET /:id`, `GET summary`, `GET efficiency?busId=` y `GET form-options` (unidades con combustible, tanque, odómetro y última carga, y últimos precios).
- `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/confirm` y `POST /:id/reject`.

### Pantallas
- **`/flota/combustible`**: banda con litros y gasto del mes, rendimiento promedio y "por confirmar · bajas"; pestañas **Cargas** (confirmar, rechazar, corregir) y **Rendimiento** (esperado, última medición, promedio de 90 días y variación por unidad). El conductor ve "Mis cargas de combustible" con el estado y el motivo de rechazo.
- **Unidad**: pestaña **Combustible** con el rendimiento contra el esperado, alerta si está bajo y el historial. Se abre directo con `?tab=fuel`.
- **Inicio**: en Pendientes salen las unidades con rendimiento bajo y, para coordinación y admin, las cargas por confirmar.
- **Ctrl+K**: acción "Registrar carga de combustible" (`?nueva=1`).
- **Parámetros**: la tarjeta de flota ahora se llama "Alertas de flota" (el cambio estaba pendiente desde la 3.3).

### Demo y pruebas
- **Demo**: `--fleet` agrega unas 200 cargas de ~3 meses que terminan en el odómetro actual de cada unidad, con parciales de vez en cuando. La 1002 cae en sus últimos tanques para que salga la alerta. Si existe un conductor demo, deja dos cargas por confirmar. `--clean` las borra.
- **Unitarias**: `fuel-rules.spec.ts`.
- **E2E**: `test/fuel.e2e-spec.ts`: permisos, total, tope del tanque, odómetro, parcial y lleno, corrección solo de la última, alerta en Pendientes, flujo del conductor (pendiente, confirmar, rechazar) y opciones del formulario.
