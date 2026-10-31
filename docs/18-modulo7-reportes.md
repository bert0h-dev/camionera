# Módulo 7 · Reportes y analytics

Pantalla única **Análisis › Reportes** (`/reportes`) con una pestaña por área. Cada reporte tiene periodo, filtros, cifras en la banda, gráficas, tablas y exportación a **Excel** y **PDF**. Es de solo lectura sobre los datos de los módulos 1–6: no agrega tablas.

## Plan aprobado (2026-10-30)

| Fase | Contenido | Estado |
|---|---|---|
| 7.1 | Base de reportes y **ventas** | ✅ fusionada (PR #34) |
| 7.2 | **Ocupación** por recorrido, ruta, horario y tramo; ventas en SQL | ✅ fusionada (PR #35) |
| 7.3 | **Cancelaciones y no presentados** | ✅ |
| 7.4 | **Flota y personal** (km, rendimiento, costo por km, puntualidad, productividad) | ✅ |
| 7.5 | **Tablero ejecutivo** (pestaña en Inicio) | ✅ rama `feat/m7-tablero` |

Decisiones:
- Gráficas con **Recharts**. Solo se descarga al abrir Reportes, porque la página se carga diferida.
- Todo en la zona de la central. Las ventas cuentan por **fecha de cobro** y los reembolsos por **la fecha en que se hicieron**, así el reporte cuadra con los cortes de caja.
- Permisos: admin y supervisor ven todo; coordinator, ventas, operación y flota; RRHH, personal; el **vendor solo sus ventas** (el servicio fuerza su `sellerId`).
- Orden aprobado: ventas → ocupación → cancelaciones → flota y personal → tablero.
- La 6.7 (venta en línea) quedó **pospuesta** hasta tener las llaves de Mercado Pago.

## Base (7.1)
- `reports/report-rules.ts` (con pruebas): validación del periodo (hasta 366 días), días del periodo para llenar con ceros, periodo anterior del mismo largo, día de un instante en una zona, suma por clave en centavos y cambio porcentual.
- `reports/report-export.ts`: exportación genérica a partir de un documento (título, cifras clave y tablas con columnas tipadas: texto, dinero, entero o porcentaje).
  - **Excel** (exceljs): hoja *Resumen* y una hoja por tabla con encabezado índigo, formato de moneda y fila fija.
  - **PDF** (pdfkit): carta horizontal con las cifras y cada tabla, que sigue en otra página si no cabe.
- Frontend: `RangePicker` con atajos (hoy, 7 días, 30 días, este mes, mes anterior) y rango libre. Las gráficas reutilizables (`DailySalesChart`, `ShareDonut`, `RankingBars`) usan la paleta de la dirección D. El periodo y los filtros viven en la URL (`desde`, `hasta`, `ruta`, `vendedor`).

## 7.1 Ventas (`GET /reports/sales` y `/reports/sales/export?format=xlsx|pdf`)
- **Filtros**: periodo, ruta, vendedor y canal.
- **Cifras**: vendido (pagos aprobados), reembolsos, neto, compras, boletos (sin contar los `changed`: cuenta el boleto que los reemplazó), boleto promedio, IVA contenido, descuentos por tipo de pasajero y por promoción. Incluye la comparación con el periodo anterior del mismo largo.
- **Por día**: vendido, reembolsos, neto y boletos.
- **Por método de pago** y **por canal**.
- **Por vendedor**: lo vendido se cuenta a quien vendió y los reembolsos a quien los hizo, como en su caja. La comisión es **estimada** con el porcentaje vigente; la congelada está en cada corte de Caja.
- **Por ruta** (importe de los boletos y su participación), **origen → destino** (los 20 tramos más vendidos, incluidos los de rutas con paradas), **por tipo de pasajero** y **por promoción**.

## 7.2 Ocupación (`GET /reports/occupancy` y `/reports/occupancy/export?format=xlsx|pdf`)
- **Ventas en SQL**: el reporte de ventas pasó de sumar en memoria a `GROUP BY` en SQL, con el día en la zona de la central (`AT TIME ZONE`). Un mes de datos demo bajó de 4.4 s a 0.9 s, y las cifras son idénticas a las de antes, comparadas con y sin filtro de ruta. Migración `report_indexes`: índice en `orders.paid_at`; `payments.paid_at`, `refunds.created_at` y `tickets(trip_id, status)` ya lo tenían.
- **Qué cuenta**: recorridos con unidad y no cancelados, por día de salida, y boletos confirmados, abordados o no presentados.
- **Medida principal, por asiento-km** (`occupancy-rules.ts`, con pruebas): km ocupados entre asientos × km de la ruta.
  - Cada boleto aporta los km de su tramo (`km_from_origin` de las paradas); si la ruta no tiene km, cada trecho pesa igual. Nunca pasa de 100 %.
  - La de **asientos** (boletos entre asientos) se da como referencia y puede pasar de 100 % con tramos.
  - Los promedios son ponderados: suma de lo ocupado entre suma de lo ofrecido.
- **Cifras**: ocupación (con su cambio en puntos contra el periodo anterior), recorridos, boletos por asiento, % de abordados y de no presentados (solo recorridos que ya salieron), ingreso por recorrido, y casi vacíos (< 25 %) y casi llenos (≥ 90 %).
- **Por día** y **por ruta**.
- **Mapa de calor**: día de la semana × franja de 3 h, por hora local del origen.
- **Por horario**: cada salida programada, del más vacío al más lleno, con recorridos, boletos promedio y casi vacíos. Los extras van aparte.
- **Por trecho**, en rutas con paradas: asientos ocupados promedio y % entre cada par de puntos.
- **Detalle por recorrido**, con liga a su ficha.
- Lo ven admin, supervisor y coordinator; el vendor no ve la pestaña.
- Verificado contra un conteo directo en la base (octubre: 437 recorridos, 12,231 boletos y 18,904 asientos).

## 7.3 Cancelaciones y no presentados (`GET /reports/cancellations` y `/reports/cancellations/export`)
- **Dos bases de fecha**:
  - Las **tasas** son por **fecha de salida**: boletos cancelados por el pasajero o no presentados entre los vendidos para los recorridos del periodo (sin contar los cancelados por la empresa).
  - La **anticipación**, los **motivos**, los **reembolsos** y los **cambios** cuentan por la fecha en que pasaron, como el dinero de ventas.
- **Reglas** (`cancellation-report-rules.ts`, con pruebas): rangos de anticipación (menos de 2 h, 2–24 h, 1–3 días, más de 3 días), motivos normalizados (sin acentos, mayúsculas ni punto final), tasas y origen del reembolso (pasajero, recorrido cancelado o diferencia de un cambio).
- **Cifras**:
  - Tasa de cancelación y de no presentados, con el cambio en puntos contra el periodo anterior.
  - Reembolsado y saldo por devolver de recorridos cancelados.
  - Cancelaciones dentro y fuera de plazo (`tickets.cancellation_hours`).
  - **Ingreso de no presentados**: lo cobrado por asientos que viajaron vacíos (no se reembolsa).
- **Desgloses**:
  - Por día de salida y por ruta, con las dos tasas.
  - Horarios con más no presentados (los que tienen al menos 20 boletos) y por tipo de pasajero.
  - Reembolsos por origen, método y quién los hizo.
  - **Recorridos cancelados por la empresa** con boletos afectados, saldo generado, reembolsado, reubicados y pendiente.
  - **Cambios**: cantidad, reubicaciones, diferencias cobradas y devueltas, y cargos.
- **Motivos fijos al cancelar**: el diálogo de cancelación ahora pide el motivo de una lista (el pasajero ya no viaja, cambio de planes, enfermedad, compró otro horario, error en la compra) o "Otro…" con texto libre. Así el reporte agrupa mejor; los textos libres anteriores se siguen agrupando normalizados.
- Lo ven admin, supervisor y coordinator.
- Verificado contra un conteo directo en la base (octubre: 13,001 vendidos, 770 cancelados, 856 no presentados y $485,396.50 reembolsados). Un mes responde en menos de 1 s.

## 7.4 Flota y personal (`GET /reports/fleet`, `/reports/staff` y sus `/export`)
- **Reglas** (`fleet-staff-rules.ts`, con pruebas): km de un recorrido (odómetro o, si falta, km de la ruta), costo por km, rendimiento y su diferencia contra el esperado del modelo, minutos de retraso, puntualidad (a tiempo = menos de 10 min) y porcentaje de asistencia (sin justificadas; medio día vale la mitad).
- **Flota**: por unidad, recorridos terminados, km (los estimados se marcan con *), litros y rendimiento entre llenos de tanque, combustible, taller (preventivo y correctivo, días en taller), costo por km e incidencias. Cifras: km, rendimiento, costo por km, cumplimiento del preventivo, unidades con rendimiento bajo (15 % o más abajo del esperado) y sin recorridos. Incidencias por gravedad y categoría, con resolución promedio.
- **Personal**:
  - Conductores: recorridos, horas, km, puntualidad, retraso promedio, incidencias.
  - Cobradores: recorridos y abordajes (por `checked_in_by` de su usuario; en los datos demo los abordajes los registra el admin, así que salen en 0).
  - Vendedores: compras, boletos, neto, comisión, cancelaciones, cortes y diferencias de caja.
  - Asistencia por empleado.
- Flota la ven admin, supervisor y coordinator; Personal también **hr** (por eso hr ya entra a Reportes, solo con esa pestaña).
- Verificado (octubre): 420 recorridos y 198,535 km (875 estimados). Cada reporte responde en menos de 1 s.

## 7.5 Tablero ejecutivo (`GET /reports/executive` y `/reports/executive/export?format=pdf`)
- Pestaña **Tablero** en Inicio (la primera para admin, supervisor y coordinator; se puede ocultar en *Personalizar*). Periodo rápido: hoy, 7 días, este mes y mes anterior.
- Reutiliza los servicios de 7.1–7.4 en paralelo; no tiene consultas propias. Responde en alrededor de 1.7 s por un mes.
- Cifras con su cambio contra el periodo anterior: neto vendido y boletos (%), ocupación, cancelación y no presentados (puntos), km y costo por km (%), salidas a tiempo y asistencia. Cada tarjeta liga a su reporte con el mismo periodo. El color del cambio indica si es bueno (por ejemplo, bajar la cancelación es verde).
- Gráfica del neto por día.
- **Focos rojos** (hasta 5 de cada uno): rutas con ocupación menor a 40 % (con al menos 5 recorridos), unidades 15 % o más debajo de su rendimiento esperado, horarios con 15 % o más de no presentados y vendedores con diferencias de caja.
- PDF de una página con las cifras y los focos rojos.

## Pantalla
- Banda: neto, vendido (con el cambio contra el periodo anterior), reembolsos y boletos; botones *Excel* y *PDF*; pestañas.
- Filtros: periodo, ruta y vendedor (este último no lo ve el vendor).
- Contenido: gráfica por día, dona por método, rutas con más ingreso, tablas por vendedor y por ruta, origen → destino, canal y descuentos, tipo de pasajero y promoción.
- Pestaña **Ocupación** (`?vista=occupancy`): aviso de cómo se mide, línea por día, barras por ruta, mapa de calor (cuadrícula propia en índigo), tabla de horarios con barra de ocupación, trechos proporcionales a sus km y detalle paginado. El filtro de vendedor solo aparece en Ventas.
- Pestañas **Flota** (`?vista=fleet`) y **Personal** (`?vista=staff`): sin filtro de ruta; barras de costo por km, incidencias y tablas por unidad, conductor, vendedor, cobrador y asistencia.
- Pestaña **Cancelaciones** (`?vista=cancellations`): aviso de las dos bases de fecha, barras por día (cancelados y no presentados), anticipación, motivos, tabla por ruta, horarios con más no presentados, reembolsos por origen y método, recorridos cancelados por la empresa (con liga a su ficha) y cambios.

## Datos demo para reportes
`npm run seed:demo -w backend -- --sales` (`prisma/seed-sales.ts`) genera historia en las rutas demo con las mismas reglas de la taquilla (temporada, tipo de pasajero, promoción, IVA y política de cancelación).
- Recorridos de los últimos 60 días: casi todos terminados, con hora real (algunos con retraso) y odómetro; alrededor de 3 % cancelados por la empresa, con saldo por devolver (la mitad ya reembolsado). Los próximos 14 días quedan con ventas parciales.
- Ocupación variable: más los fines de semana y en horas pico, y tramos entre paradas que reutilizan asientos.
- Pagos en efectivo, tarjeta, transferencia y mixtos, hechos por los tres vendedores demo (se les crea usuario sin contraseña conocida). Hay una caja por vendedor y día, con corte y algunas diferencias.
- Alrededor de 93 % aborda y el resto no se presenta; alrededor de 6 % cancela con reembolso según la política, y hay algunos cambios de asiento.
- Las compras y los boletos demo usan folios `D…`, sus compras y recorridos llevan la nota `DEMO-VENTAS`, los clientes el correo `@demo.camionera.mx` y las promociones la clave `DEMO…`. `--clean` general también los borra.
- Cargas de combustible demo (ticket `DEMO-VENTAS…`): tanque lleno cada 900–1300 km; la unidad 1002 rinde bajo en los últimos 15 días.
- Volumen: unos 900 recorridos y 30 mil boletos. Con él, un mes de ventas responde en menos de 1 s y uno de ocupación en alrededor de 1.5 s (incluye el periodo anterior).

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/reports/sales?from=&to=&routeId=&sellerId=&channel=` | admin, supervisor, coordinator; vendor (solo lo suyo) |
| GET | `/reports/sales/export?format=xlsx\|pdf&…` | igual |
| GET | `/reports/occupancy?from=&to=&routeId=` · `/reports/occupancy/export?format=xlsx\|pdf&…` | admin, supervisor, coordinator |
| GET | `/reports/cancellations?from=&to=&routeId=` · `/reports/cancellations/export?format=xlsx\|pdf&…` | admin, supervisor, coordinator |
| GET | `/reports/fleet?from=&to=` · `/reports/fleet/export?format=xlsx|pdf&…` | admin, supervisor, coordinator |
| GET | `/reports/staff?from=&to=` · `/reports/staff/export?format=xlsx|pdf&…` | admin, supervisor, coordinator, hr |
| GET | `/reports/executive?from=&to=` · `/reports/executive/export?format=pdf&…` | admin, supervisor, coordinator |
