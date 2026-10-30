# Estado del proyecto y siguientes pasos

**Última actualización:** 2026-10-30

## Dónde nos quedamos
- **Módulo 1, Gestión de Personal**: ✅ completo y fusionado en `main` (docs 03–09).
- **Módulo 2, Administración del Sistema**: ✅ completo y fusionado (doc 10).
- **Rediseño**: dirección D aplicada a todo, D5 terminada (buscador Ctrl+K y carga diferida).
- **Módulo 3, Gestión de Flota** (doc 12): ✅ completo con la 3.4.
  - 3.0 catálogos, modelos y terminales con mapa ✅ fusionada (PR #8).
  - 3.1 Unidades ✅ fusionada (PR #9).
  - 3.2 Mantenimientos ✅ fusionada (PR #10).
  - 3.3 Incidencias ✅ fusionada (PR #13).
  - 3.4 Combustible ✅ fusionada (PR #15).
- **Módulo 4, Gestión de Rutas** (doc 15): ✅ completo con la 4.5.
  - 4.1 Rutas y zona horaria por ciudad ✅ fusionada (PR #17; migración con todas las tablas del módulo).
  - 4.2 Horarios ✅ fusionada (PR #18).
  - 4.3 Paradas ✅ fusionada (PR #19).
  - 4.4 Temporadas ✅ fusionada (PR #20).
  - 4.5 Búsqueda de salidas ✅ fusionada (PR #22).
  - Con la 4.1: los modales ya no se cierran con un clic afuera (solo X, Cancelar o Esc), y Catálogos › Terminales y Ciudades tienen buscador y paginado de 20 en pantalla.
- **Módulo 5, Gestión de Recorridos** (doc 16): ✅ completo con la 5.4.
  - 5.1 Generación automática, extras y pantalla Recorridos ✅ fusionada (PR #23).
  - 5.2 Asignación de unidad, conductor y cobrador con validaciones y Pendientes ✅ fusionada (PR #24).
  - 5.3 Estados, tiempos reales, odómetro y Mis recorridos ✅ fusionada (PR #25).
  - 5.4 Incidencias del recorrido, aviso por correo y pestaña Recorridos en Inicio ✅ fusionada (PR #26).
- **Módulo 6, Gestión de Boletos** (doc 17): ✅ completo para taquilla (6.0–6.6); la 6.7 (venta en línea) está pospuesta.
  - 6.0 Esquema, reglas de precio, disponibilidad y cancelación, y tipos de pasajero ✅ fusionada (PR #27).
  - 6.1 Disponibilidad por tramo, mapa de asientos, apartado y pantalla Taquilla ✅ fusionada (PR #28).
  - 6.2 Pasajeros, cobro en taquilla, boleto con QR en PDF, correo, Ventas y logo ✅ fusionada (PR #29).
  - 6.3 Caja, corte con arqueo y desglose, comisión, PDF del corte y Pendientes de caja ✅ fusionada (PR #30).
  - 6.4 Cancelaciones, cambios, reembolsos, recorrido cancelado y extras en la venta ✅ fusionada (PR #31).
  - 6.5 Abordaje con QR o folio, manifiesto en PDF y no presentados ✅ fusionada (PR #32).
  - 6.6 Promociones (acumulables con el tipo de pasajero) y clientes ✅ fusionada (PR #33).
  - 6.7 Venta en línea con Mercado Pago ⏸️ **pospuesta** por decisión del usuario; se retoma cuando haya llaves de prueba. El resto del módulo funciona sin ella.
- **Módulo 7, Reportes y analytics** (doc 18): 🚧 en curso, plan 7.1–7.5 aprobado.
  - 7.1 Base de reportes y ventas (Excel y PDF) ✅ en la rama `feat/m7-ventas`.
- **Zona horaria de la central** configurable ✅ fusionada (PR #21): parámetro `company.timezone` en Configuración › Empresa.
- **README** actualizado al estado actual (módulos 1–4, roles, tablas, variables y scripts).
- **Inicio reorganizado** (doc 13): ✅ fusionado (PR #11).
- **Parámetros por módulo** (doc 14): ✅ fusionado (PR #12).

## Lo que sigue
1. **Módulo 7, Reportes**: sigue la 7.2 (ocupación). Fases y decisiones en el doc 18.
2. **Pospuesto**: 6.7 venta en línea (Mercado Pago, pedir llaves de prueba).
3. **Facturación CFDI 4.0**: módulo posterior al 6 (necesita un PAC).

## Pendientes y decisiones abiertas
- **Resend**: verificar un dominio propio y cambiar `MAIL_FROM`. Con `onboarding@resend.dev` solo llega a la dirección dueña de la cuenta. También corregir el typo "Cental" en `backend/.env`.
- **Neon**: cambiar la contraseña de la base de datos, porque se compartió en el chat al inicio del proyecto.
- **Logo de la empresa**: ✅ desde la 6.2 en Configuración › Empresa (tabla `stored_files`). Falta que el usuario suba el logo real.
- **`TICKET_QR_SECRET`**: variable nueva en `backend/.env` (ya generada en local); en producción debe definirse con su propio valor.
- **Respaldos (2.5)**: fuera por decisión del usuario; se usa la restauración de Neon.
- **Datos demo**: siguen cargados en Neon (`npm run seed:demo -w backend`) y **no se borran hasta que el usuario lo pida**.
  - `-- --clean` los borra.
  - `-- --payroll` agrega solo la nómina demo.
  - `-- --fleet` agrega solo la flota demo (no toca al personal), incluidas las cargas de combustible y las rutas demo.
  - `-- --routes` agrega solo las rutas demo (clave `DEM-…`).
  - `-- --sales` agrega **ventas demo** para los reportes: recorridos de los últimos 60 días y los próximos 14 en las rutas demo, unos 30 mil boletos con pagos, cajas con corte, abordajes, no presentados, cancelaciones, cambios, reembolsos, promociones `DEMO…` y 80 clientes. Reemplaza las anteriores; `-- --sales --clean` solo las borra. Es determinista (misma semilla, mismos datos).
- **Zonas horarias**: las ciudades que no son demo quedaron en `America/Mexico_City`; revisar las del noroeste o el sureste (p. ej. Mexicali → `America/Tijuana`).
- Del contexto, resueltos en el M6: venta por tramos (con reutilización de asiento), carrito (`orders`) y tipo de pasajero. Sigue abierto: andenes de las terminales.

## Forma de trabajo acordada
- **Lint**: el proyecto usa **oxlint** (`npm run lint`), no ESLint. Los avisos `no-misused-spread` de los servicios de flota son conocidos.
- **Siempre plan antes de código**, y esperar la aprobación del usuario.
- **Ramas y PR**: una rama por fase (`feat/...`) y un PR. El usuario fusiona y pide pasar a `main` y borrar la rama.
- **Commits** con gitmoji en código y en español: `:sparkles: feat: …`.
- **Diseño**: todo lo nuevo sigue la dirección D (`PageHeader` con banda, `HeroStat`, `font-data`, `FilterBar`, `Alert`, `LoadingBlock`).
- **Docs en cada PR**: además del doc de la fase y este doc 11, revisar los docs anteriores que el cambio deje obsoletos (reglas, pantallas, parámetros) y corregirlos en el mismo PR.
- **Modales**: no se cierran con clic en el fondo, para no perder lo capturado; solo con la X, Cancelar o Esc.
- **Fechas en el frontend**: `formatDate` solo para columnas de fecha (`@db.Date`); para instantes (`Timestamptz`) usar `formatInstantDate` y `formatTime`, que usan la zona de la central.
- **Zona horaria de la central**: nunca escribir `America/Mexico_City` fijo.
  - Backend: `businessTimezone()` y las funciones de `common/dates.ts` (la carga `SettingsService` al arrancar y al guardar `company.timezone`).
  - Frontend: `businessFormat({...})` y `todayKey()` de `lib/format.ts` (la fija `AppLayout` con `/settings/company`).
  - El cierre diario de asistencias corre cada hora y actúa a las 02:00 locales; la purga de bitácora sigue a las 03:00 del centro (no importa la hora exacta).
- **Revisión visual en Chrome** en cada fase.
  - Antes, apagar los procesos node del proyecto filtrando por `Repos\camionera` **y** por puerto (3002 y 5173): `node dist/main` no lleva la ruta en su línea de comandos.
  - Verificar que una ruta nueva responda 401 y no 404.
- **e2e**: no correr `attendance.e2e-spec` con los datos demo cargados, porque cierra el día anterior para todos.
