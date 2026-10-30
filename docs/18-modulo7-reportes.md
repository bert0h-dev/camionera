# Módulo 7 · Reportes y analytics

Pantalla única **Análisis › Reportes** (`/reportes`) con una pestaña por área. Cada reporte tiene periodo, filtros, cifras en la banda, gráficas, tablas y exportación a **Excel** y **PDF**. Es de solo lectura sobre los datos de los módulos 1–6: no agrega tablas.

## Plan aprobado (2026-10-30)

| Fase | Contenido | Estado |
|---|---|---|
| 7.1 | Base de reportes y **ventas** | ✅ rama `feat/m7-ventas` |
| 7.2 | **Ocupación** por recorrido, ruta, horario y tramo | ⏳ |
| 7.3 | **Cancelaciones y no presentados** | ⏳ |
| 7.4 | **Flota y personal** (km, rendimiento, costo por km, puntualidad, productividad) | ⏳ |
| 7.5 | **Tablero ejecutivo** (pestaña en Inicio) | ⏳ |

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

## Pantalla
- Banda: neto, vendido (con el cambio contra el periodo anterior), reembolsos y boletos; botones *Excel* y *PDF*; pestañas.
- Filtros: periodo, ruta y vendedor (este último no lo ve el vendor).
- Contenido: gráfica por día, dona por método, rutas con más ingreso, tablas por vendedor y por ruta, origen → destino, canal y descuentos, tipo de pasajero y promoción.

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/reports/sales?from=&to=&routeId=&sellerId=&channel=` | admin, supervisor, coordinator; vendor (solo lo suyo) |
| GET | `/reports/sales/export?format=xlsx\|pdf&…` | igual |
