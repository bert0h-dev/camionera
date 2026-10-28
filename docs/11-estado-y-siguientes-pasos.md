# Estado del proyecto y siguientes pasos

**Última actualización:** 2026-10-28

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
- **Módulo 4, Gestión de Rutas** (doc 15): 🚧 en curso.
  - 4.1 Rutas y zona horaria por ciudad ✅ en la rama `feat/m4-rutas` (migración con todas las tablas del módulo).
  - En la misma rama: los modales ya no se cierran con un clic afuera (solo X, Cancelar o Esc), y Catálogos › Terminales y Ciudades tienen buscador y paginado de 20 en pantalla.
- **README** actualizado al estado actual (módulos 1–3, roles, tablas, variables y scripts).
- **Inicio reorganizado** (doc 13): ✅ fusionado (PR #11).
- **Parámetros por módulo** (doc 14): ✅ fusionado (PR #12).

## Lo que sigue
1. **Módulo 4, Rutas**: 4.2 Horarios, 4.3 Paradas, 4.4 Temporadas globales (precio a peso entero) y 4.5 Búsqueda (ver doc 15).
2. Después vienen los Módulos 5 (Recorridos), 6 (Boletos) y 7 (Reportes).
   - Los parámetros `trips.*` y `tickets.*` ya están listos.

## Pendientes y decisiones abiertas
- **Resend**: verificar un dominio propio y cambiar `MAIL_FROM`. Con `onboarding@resend.dev` solo llega a la dirección dueña de la cuenta. También corregir el typo "Cental" en `backend/.env`.
- **Neon**: cambiar la contraseña de la base de datos, porque se compartió en el chat al inicio del proyecto.
- **Logo de la empresa**: se agrega junto con el almacenamiento de archivos (Módulo 6).
- **Respaldos (2.5)**: fuera por decisión del usuario; se usa la restauración de Neon.
- **Datos demo**: siguen cargados en Neon (`npm run seed:demo -w backend`) y **no se borran hasta que el usuario lo pida**.
  - `-- --clean` los borra.
  - `-- --payroll` agrega solo la nómina demo.
  - `-- --fleet` agrega solo la flota demo (no toca al personal), incluidas las cargas de combustible y las rutas demo.
  - `-- --routes` agrega solo las rutas demo (clave `DEM-…`).
- **Zonas horarias**: las ciudades que no son demo quedaron en `America/Mexico_City`; revisar las del noroeste o el sureste (p. ej. Mexicali → `America/Tijuana`).
- Del contexto, aún abiertos para módulos futuros: venta por tramos, carrito u orden, terminales y andenes, y tipo de pasajero.

## Forma de trabajo acordada
- **Lint**: el proyecto usa **oxlint** (`npm run lint`), no ESLint. Los avisos `no-misused-spread` de los servicios de flota son conocidos.
- **Siempre plan antes de código**, y esperar la aprobación del usuario.
- **Ramas y PR**: una rama por fase (`feat/...`) y un PR. El usuario fusiona y pide pasar a `main` y borrar la rama.
- **Commits** con gitmoji en código y en español: `:sparkles: feat: …`.
- **Diseño**: todo lo nuevo sigue la dirección D (`PageHeader` con banda, `HeroStat`, `font-data`, `FilterBar`, `Alert`, `LoadingBlock`).
- **Docs en cada PR**: además del doc de la fase y este doc 11, revisar los docs anteriores que el cambio deje obsoletos (reglas, pantallas, parámetros) y corregirlos en el mismo PR.
- **Modales**: no se cierran con clic en el fondo, para no perder lo capturado; solo con la X, Cancelar o Esc.
- **Fechas en el frontend**: `formatDate` solo para columnas de fecha (`@db.Date`); para instantes (`Timestamptz`) usar `formatInstantDate` y `formatTime`, que usan la zona de la central.
- **Revisión visual en Chrome** en cada fase.
  - Antes, apagar los procesos node del proyecto filtrando por `Repos\camionera` **y** por puerto (3002 y 5173): `node dist/main` no lleva la ruta en su línea de comandos.
  - Verificar que una ruta nueva responda 401 y no 404.
- **e2e**: no correr `attendance.e2e-spec` con los datos demo cargados, porque cierra el día anterior para todos.
