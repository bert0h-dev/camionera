# Módulo 6 · Gestión de Boletos

Un **boleto** es un pasajero en un asiento de un recorrido, para un tramo del itinerario (de su parada de subida a la de bajada). Los boletos se agrupan en una **compra** (`orders`), que tiene sus pagos y reembolsos.

## Plan aprobado (2026-10-30)

| Fase | Contenido | Estado |
|---|---|---|
| 6.0 | Esquema completo, reglas puras (precio, disponibilidad, cancelación, estados) y catálogo de tipos de pasajero | ✅ rama `feat/m6-esquema` |
| 6.1 | Disponibilidad por tramo, mapa de asientos y apartado temporal con vencimiento automático | ⏳ |
| 6.2 | Venta en taquilla: búsqueda → mapa → pasajeros → cobro (efectivo, tarjeta en terminal, transferencia o mixto); boleto con QR en PDF y por correo; logo de la empresa | ⏳ |
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

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/tickets/passenger-types?includeInactive=` | coordinator, supervisor, vendor |
| POST · PATCH | `/tickets/passenger-types` · `/tickets/passenger-types/:id` | admin |

## Datos
`npm run prisma:seed -w backend` siembra los cuatro tipos de pasajero (no sobrescribe los existentes).
