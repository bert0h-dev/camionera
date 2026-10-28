# Estado del proyecto y siguientes pasos

**Última actualización:** 2026-10-27

## Dónde nos quedamos
- **Módulo 1, Gestión de Personal**: ✅ completo y fusionado en `main` (docs 03–09).
- **Módulo 2, Administración del Sistema**: ✅ completo y fusionado (doc 10).
- **Rediseño**: dirección D aplicada a todo, D5 terminada (buscador Ctrl+K y carga diferida).
- **Módulo 3, Gestión de Flota** (doc 12):
  - 3.0 catálogos, modelos y terminales con mapa ✅ fusionada (PR #8).
  - 3.1 Unidades ✅ fusionada (PR #9).
  - **3.2 Mantenimientos** lista en la rama `feat/m3-mantenimientos` (PR por fusionar).

## Lo que sigue
1. **Módulo 3**: siguen 3.3 Incidencias y 3.4 Combustible (ver doc 12).
2. **Módulo 4, Rutas**: origen, destino y paradas entre terminales con ubicación; precios por tramo, horarios, cancelación y temporadas.
3. Después vienen los Módulos 5 (Recorridos), 6 (Boletos) y 7 (Reportes).
   - Los parámetros `trips.*` y `tickets.*` ya están listos.

## Pendientes y decisiones abiertas
- **Resend**: verificar un dominio propio y cambiar `MAIL_FROM`. Con `onboarding@resend.dev` solo llega a la dirección dueña de la cuenta. También corregir el typo "Cental" en `backend/.env`.
- **Neon**: cambiar la contraseña de la base de datos, porque se compartió en el chat al inicio del proyecto.
- **Logo de la empresa**: se agrega junto con el almacenamiento de archivos (Módulo 6).
- **Respaldos (2.5)**: fuera por decisión del usuario; se usa la restauración de Neon.
- **Datos demo**: siguen cargados en Neon (`npm run seed:demo -w backend`) y **no se borran hasta que el usuario lo pida**.
  - `-- --clean` los borra.
  - `-- --payroll` agrega solo la nómina demo.
  - `-- --fleet` agrega solo la flota demo (no toca al personal).
- Del contexto, aún abiertos para módulos futuros: venta por tramos, carrito u orden, terminales y andenes, y tipo de pasajero.

## Forma de trabajo acordada
- **Siempre plan antes de código**, y esperar la aprobación del usuario.
- **Ramas y PR**: una rama por fase (`feat/...`) y un PR. El usuario fusiona y pide pasar a `main` y borrar la rama.
- **Commits** con gitmoji en código y en español: `:sparkles: feat: …`.
- **Diseño**: todo lo nuevo sigue la dirección D (`PageHeader` con banda, `HeroStat`, `font-data`, `FilterBar`, `Alert`, `LoadingBlock`).
- **Revisión visual en Chrome** en cada fase.
  - Antes, apagar los procesos node del proyecto filtrando por `Repos\camionera` **y** por puerto (3002 y 5173): `node dist/main` no lleva la ruta en su línea de comandos.
  - Verificar que una ruta nueva responda 401 y no 404.
- **e2e**: no correr `attendance.e2e-spec` con los datos demo cargados, porque cierra el día anterior para todos.
