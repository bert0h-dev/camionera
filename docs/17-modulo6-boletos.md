# Módulo 6 · Gestión de Boletos

Un **boleto** es un pasajero en un asiento de un recorrido, para un tramo del itinerario (de su parada de subida a la de bajada). Los boletos se agrupan en una **compra** (`orders`), que tiene sus pagos y reembolsos.

## Plan aprobado (2026-10-30)

| Fase | Contenido | Estado |
|---|---|---|
| 6.0 | Esquema completo, reglas puras (precio, disponibilidad, cancelación, estados) y catálogo de tipos de pasajero | ✅ fusionada (PR #27) |
| 6.1 | Disponibilidad por tramo, mapa de asientos y apartado temporal con vencimiento automático | ✅ fusionada (PR #28) |
| 6.2 | Venta en taquilla: búsqueda → mapa → pasajeros → cobro (efectivo, tarjeta en terminal, transferencia o mixto); boleto con QR en PDF y por correo; logo de la empresa | ✅ rama `feat/m6-venta` |
| 6.3 | Caja y corte: apertura con fondo, movimientos, retiros, arqueo y comisión del vendedor | ⏳ |
| 6.4 | Cancelaciones, cambios y reembolsos; recorrido cancelado (`onTripCancelled`); cambio de unidad con boletos | ⏳ |
| 6.5 | Check-in con QR desde *Mis recorridos*, manifiesto de pasajeros, no presentados y ocupación real | ⏳ |
| 6.6 | Promociones y clientes | ⏳ |
| 6.7 | Venta en línea (portal público `/viajar`) con Mercado Pago y webhooks; consulta y cancelación por folio + correo | ⏳ |

Decisiones:
- **Venta por tramos con reutilización de asiento**: A→B y B→C pueden usar el mismo asiento; A→C y B→D no.
- **Solo se vende con unidad asignada**, así el mapa de asientos siempre es el real.
- **Pasarela**: Mercado Pago (llaves de prueba al llegar a la 6.7).
- **Impresión**: solo PDF por ahora; sin formato térmico de 80 mm.
- **CFDI 4.0**: fuera del M6, como módulo posterior.
- Tipos de pasajero iniciales (editables): Adulto 0 %, Niño 50 %, INAPAM 50 % con cupo de 4 por recorrido, y Estudiante o maestro 50 % solo en temporada alta o de vacaciones.
- El precio se calcula **siempre en el backend** y se congela en el boleto: cambiar una tarifa no toca lo vendido.

## Tablas (migración `tickets`, todas las del módulo)
- **`customers`**: quien compra (nombre, correo, teléfono). Es opcional en taquilla.
- **`passenger_types`**: clave, nombre, `discount_percent`, `max_per_trip` (cupo; null = sin cupo), `requires_id` (se pide credencial al abordar), `season_types` (el descuento solo aplica en esas temporadas; vacío = siempre), `is_default`, activo y orden.
- **`orders`**: folio, canal (`counter` / `online`), estado (`pending`, `paid`, `expired`, `cancelled`), cliente y correo o teléfono de contacto, vendedor y caja, totales (subtotal, descuento, IVA, cargo en línea, total) y `expires_at` del apartado.
- **`tickets`**: folio, `trip_id`, **número de asiento** (no el id de `bus_seats`, para sobrevivir a un cambio de unidad con el mismo acomodo), `board_index` / `alight_index` y sus terminales e instantes, pasajero y su tipo, precio congelado (`base_price` con temporada, `season_percent`, descuentos, IVA, cargo, total), estado, `qr_token`, check-in, cancelación y `replaced_by` (cambio por otro boleto).
- **`payments`**: varios por compra (pago mixto); método (`cash`, `card`, `transfer`, `mercadopago`), estado, monto, efectivo recibido, referencia, `gateway_payment_id` único (webhook idempotente) y caja.
- **`refunds`**: de la compra o de un boleto, con método, monto, motivo, quién y caja.
- **`promotions`** y **`order_promotions`**: código, porcentaje o monto (con tope), usos, compra mínima, vigencia y canales.
- **`cash_sessions`** y **`cash_movements`**: caja por usuario (fondo, apertura, corte con esperado, contado y diferencia) y sus movimientos (venta, reembolso, retiro, ingreso).
- **`ticket_events`**: historial de cada boleto para auditoría y para el Módulo 7.

Reglas en la base (SQL de la migración, Prisma no las modela):
- **Doble venta imposible**: exclusion constraint `tickets_seat_no_overlap` sobre (`trip_id`, `seat_number`, `int4range(board_index, alight_index)`) para los boletos `held`, `confirmed` y `checked_in`. Usa `btree_gist`, como las de recorridos.
  - Un apartado vencido sigue contando para la base hasta que se libera; el servicio libera los vencidos del recorrido en la misma transacción antes de apartar (6.1).
- Checks: el tramo es válido (`alight_index > board_index`), los montos no son negativos y los pagos, reembolsos y movimientos son positivos.
- **Una sola caja abierta por usuario** (índice único parcial).
- Secuencias `order_number_seq` y `ticket_number_seq` para los folios (el formato se define en la 6.2).

## Reglas puras (`backend/src/tickets/`, con pruebas en `ticket-rules.spec.ts`)
- `money.ts`: todo se calcula en centavos enteros.
- `ticket-status-rules.ts`: `held` → `confirmed` o `cancelled`; `confirmed` → `checked_in`, `no_show`, `cancelled` o `changed`; los demás son finales. `ACTIVE_STATUSES` son los que ocupan asiento.
- `availability-rules.ts`: dos tramos se enciman si comparten un trecho (tocarse en una parada no cuenta). Estado de cada asiento por tramo (`free`, `held`, `occupied`, `blocked`), asientos libres y cupo restante de un tipo de pasajero.
- `pricing-rules.ts`: tarifa del tramo con temporada → descuento del tipo de pasajero (si aplica en la temporada del viaje) → promoción repartida en proporción (el residuo de centavos va al último boleto) → IVA desglosado si las tarifas lo incluyen o sumado si no → cargo en línea sobre la tarifa con IVA. Valida las promociones (activa, vigencia, usos, canal y compra mínima).
- `cancellation-rules.ts`: dentro de `tickets.cancellation_hours` antes de la subida se devuelve `tickets.refund_percent` del importe **sin el cargo en línea**; fuera de plazo, nada. Si la empresa cancela el recorrido se devuelve todo, cargo incluido.

## Parámetros (Configuración › Parámetros › Boletos)
- Nuevos: `tickets.hold_minutes` (10 min, apartado en taquilla), `tickets.online_hold_minutes` (15 min, apartado en línea) y `tickets.change_fee` ($0, cargo por cambio además de la diferencia).
- Ya existían: `tickets.cancellation_hours`, `tickets.refund_percent`, `tickets.checkin_minutes` y `tickets.max_per_purchase`, más IVA y comisiones en *Impuestos y comisiones*.
- El grupo dejó "Próximamente": ahora es el módulo **Boletos**. Debajo está la tarjeta **Tipos de pasajero** (alta, edición, activar o desactivar; siempre hay uno predeterminado y ese no se desactiva). El buscador de parámetros la encuentra por "pasajero", "INAPAM", "descuento", etc.

## 6.1 Disponibilidad, mapa y apartado
- **Itinerario del recorrido** (`itinerary-rules.ts`): origen, paradas y destino con índice, terminal, hora de paso y precio acumulado. Las paradas salen de la ruta actual; el destino usa la duración copiada en el recorrido para coincidir con su llegada. Cada boleto guarda sus terminales y sus instantes de subida y bajada.
- **Cuándo se vende** (`hold-rules.ts`): recorrido programado, abordando o retrasado antes de salir, **con unidad asignada**, y mientras no haya pasado la hora del punto de subida. Si no, la respuesta dice por qué.
- **Mapa** (`GET /tickets/trips/:id/seats?board=&alight=`): acomodo de la unidad con el estado de cada asiento en el tramo (libre, apartado, vendido o bloqueado; los apartados propios se marcan aparte), precio del tramo con temporada, conteos y cupo restante de cada tipo de pasajero.
- **Búsqueda con disponibilidad** (`GET /tickets/departures`): la del M4.5 más el recorrido generado, si se vende y los lugares libres del tramo. *Rutas › Buscar salidas* ya la usa y muestra los libres con liga a la taquilla.
- **Apartado** (`POST /tickets/holds`): crea una compra `pending` con boletos `held` a precio de adulto (los tipos de pasajero se capturan en la 6.2), que vence en `tickets.hold_minutes`.
  - Respeta `tickets.max_per_purchase`, rechaza asientos inexistentes o bloqueados y, en la misma transacción, libera primero los apartados vencidos de ese recorrido.
  - Si dos vendedores apartan el mismo asiento a la vez, la exclusion constraint deja pasar uno y el otro recibe 409 (probado contra la base).
  - `PATCH /tickets/holds/:id` quita asientos (no todos) o **extiende una vez** sumando otro `hold_minutes`. Para agregar asientos se suelta y se aparta de nuevo.
  - `DELETE /tickets/holds/:id` suelta el apartado completo.
- **Vencimiento**: un cron cada minuto pasa a `expired` las compras vencidas y a `cancelled` sus boletos, con evento `released`.
- **Folios**: compra `C0000001`, boleto `B0000001` (secuencias de la migración).
- **Ocupación**: la lista y la ficha de Recorridos muestran boletos vendidos / asientos y los apartados vigentes. Cuenta boletos, no asientos: con venta por tramos un asiento puede llevar varios.

## 6.2 Pasajeros, cobro y boleto
- **Pasajeros** (`PUT /tickets/orders/:id/passengers`): nombre, tipo e identificación por asiento (`sale-rules.ts`: nombre de al menos 3 letras; identificación obligatoria si el tipo pide credencial). Vuelve a validar el cupo del tipo en el tramo sin contar la propia compra y recalcula los precios en el servidor. El contacto (nombre, correo, teléfono) es opcional; con correo se busca o crea el cliente en `customers`.
- **Cobro** (`POST /tickets/orders/:id/pay`): uno a cinco pagos en efectivo (con lo recibido y el cambio), tarjeta en terminal (pide autorización) o transferencia (pide referencia). Deben sumar exactamente el total.
  - En una transacción: la compra pasa a `paid` solo si sigue `pending` y vigente (cierra la carrera con el vencimiento; si no, 409), se crean los pagos `approved`, los boletos pasan a `confirmed` con su `qr_token` y queda el evento `confirmed`. También se registra en la bitácora.
  - Sin caja todavía: el pago queda sin `cash_session_id`; la caja, el corte y la comisión llegan en la 6.3.
  - Si la compra tiene correo, se mandan los boletos al pagar. Si el envío falla, la venta sigue y solo queda en el log.
- **QR** (`qr-token.ts`): `CC1.<id del boleto>.<firma HMAC-SHA256>` con `TICKET_QR_SECRET` (variable nueva del `.env`; el servidor no arranca sin ella). Se verifica con comparación de tiempo constante; la 6.5 lo usa al abordar.
- **Boleto en PDF** (`ticket-pdf.ts`, con pdfkit y qrcode): un boleto por página en media carta. Lleva la banda índigo con el logo y el nombre comercial, el folio del boleto y de la compra, la salida y la llegada en hora local de cada terminal, el pasajero con su tipo e identificación, el asiento, la ruta, el recorrido y la unidad, el desglose (tarifa, descuento, cargo, IVA incluido y total), el QR y las condiciones (`checkin_minutes`, `cancellation_hours`, `refund_percent`). Al pie van los datos fiscales y de contacto de Configuración › Empresa.
  - `GET /tickets/orders/:id/pdf` y `POST /tickets/orders/:id/send` (a otro correo o al de la compra).
- **Ventas del día** (`GET /tickets/orders?date=&search=&mine=`): compras cobradas por día de la central, con buscador por folio de compra o de boleto, pasajero o correo, y el total vendido. El vendedor ve solo las suyas; supervisor y admin, todas.
- **Logo de la empresa**: tabla `stored_files` (migración `stored_files`, bytea en la base). PNG, JPG o WebP de hasta 512 KB (`files/file-rules.ts`). El PDF solo dibuja PNG y JPG.
  - `GET /files/company-logo` es público (va en `<img>`, correos y la venta en línea). `GET /files/company-logo/info`, `PUT` (data URL) y `DELETE` son de admin. El límite del cuerpo JSON subió a 1 MB por el data URL.

## Pantallas
- **Venta › Taquilla** (`/taquilla`; coordinator, supervisor y vendor; el supervisor ve pero no aparta):
  1. Salida: origen, destino y fecha, con lugares libres y botón *Elegir asientos* (o el motivo si no se vende).
  2. Asientos: mapa del tramo (se refresca cada 15 s), itinerario con el tramo resaltado y total estimado; *Apartar*.
  3. Pasajeros y cobro: a la izquierda, un renglón por asiento (nombre, tipo con el cupo que queda e identificación) y el contacto, con *Confirmar pasajeros*, que recalcula el total. Después, el cobro con uno o varios pagos, lo que falta o sobra y el cambio en grande. A la derecha queda el resumen del apartado con el contador, *Más tiempo* y *Soltar asientos*.
  4. Venta lista: cambio a entregar, boletos con folio, *Imprimir boletos (PDF)* (se abre en otra pestaña), *Mandar por correo* y *Nueva venta*.
  - El estado vive en la URL (`origen`, `destino`, `fecha`, `viaje`, `sube`, `baja`, `compra`).
- El mapa de Flota (`BusSeatMap`) acepta `seatLook` y `legend` para pintar estados de venta (`SeatPicker`).
- Ficha del recorrido: cifra **Boletos** en la banda, con liga a la taquilla para el recorrido completo.
- Buscador Ctrl+K: "Vender boletos (taquilla)".
- **Venta › Ventas** (`/ventas`): día con flechas, cifras (vendido, compras, boletos), buscador, "Solo mis ventas" para supervisión y admin, y por compra *PDF* y *Correo*.
- **Configuración › Empresa**: tarjeta **Logo** para subir, cambiar o quitar.

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/tickets/passenger-types?includeInactive=` | coordinator, supervisor, vendor |
| POST · PATCH | `/tickets/passenger-types` · `/tickets/passenger-types/:id` | admin |
| GET | `/tickets/departures` (mismos filtros que `/routes/search`) · `/tickets/trips/:id/seats` · `/tickets/orders/:id` | coordinator, supervisor, vendor |
| POST · PATCH · DELETE | `/tickets/holds` · `/tickets/holds/:id` | coordinator, vendor |
| PUT · POST | `/tickets/orders/:id/passengers` · `/tickets/orders/:id/pay` | coordinator, vendor |
| GET · POST | `/tickets/orders` · `/tickets/orders/:id/pdf` · `/tickets/orders/:id/send` | coordinator, supervisor, vendor |
| GET | `/files/company-logo` | público |
| GET · PUT · DELETE | `/files/company-logo/info` · `/files/company-logo` | admin |

Una compra solo la ve su vendedor, el supervisor o el admin.

## Datos
`npm run prisma:seed -w backend` siembra los cuatro tipos de pasajero (no sobrescribe los existentes).
