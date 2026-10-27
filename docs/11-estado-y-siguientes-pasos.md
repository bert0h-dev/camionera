# Estado del proyecto y siguientes pasos

**Última actualización:** 2026-10-27

## Dónde nos quedamos
- **Módulo 1, Gestión de Personal**: ✅ completo y fusionado en `main` (docs 03–09).
- **Módulo 2, Administración del Sistema**: ✅ completo (doc 10), **pendiente de fusionar**:
  - Rama `feat/m2-parametros` (2.3), PR abierto o por abrir.
  - Rama `feat/m2-bitacora` (2.4). **Incluye todo 2.3**: basta fusionar esta y cerrar la de 2.3, o fusionar 2.3 primero y luego 2.4.
  - Al fusionar: `git switch main && git pull`, luego borrar ambas ramas en local y en GitHub.
- **Rediseño**: dirección D aplicada a todo y **D5 terminada** (rama `feat/d5-buscador`): buscador Ctrl+K y carga diferida de rutas (paquete principal de 733 kB a 74 kB).

## Lo que sigue
1. **Módulo 3, Gestión de Rutas**, según `contexto/00-importante.md`:
   - Rutas con origen, destino y paradas intermedias.
   - Precios por tramo.
   - Horarios y frecuencias.
   - Políticas de cancelación, usando los parámetros `tickets.*` que ya existen.
   - Temporadas y tarifas especiales.
   - Primero: leer el contexto y el esquema original (`contexto/01-EsquemaBD.prisma`), proponer el plan y esperar aprobación.
2. Después vienen los Módulos 4 (Recorridos), 5 (Flota), 6 (Boletos) y 7 (Reportes).
   - Los parámetros `trips.*` y `tickets.*` ya están listos para el 4 y el 6.

## Pendientes y decisiones abiertas
- **Resend**: verificar un dominio propio y cambiar `MAIL_FROM`. Con `onboarding@resend.dev` solo llega a la dirección dueña de la cuenta. También corregir el typo "Cental" en `backend/.env`.
- **Neon**: cambiar la contraseña de la base de datos, porque se compartió en el chat al inicio del proyecto.
- **Logo de la empresa**: se agrega junto con el almacenamiento de archivos (Módulo 6).
- **Respaldos (2.5)**: fuera por decisión del usuario; se usa la restauración de Neon.
- **Datos demo**: siguen cargados en Neon (`npm run seed:demo -w backend`) y **no se borran hasta que el usuario lo pida**.
  - `-- --clean` los borra.
  - `-- --payroll` agrega solo la nómina demo.
- Del contexto, aún abiertos para módulos futuros: venta por tramos, carrito u orden, terminales y andenes, y tipo de pasajero.

## Forma de trabajo acordada
- **Siempre plan antes de código**, y esperar la aprobación del usuario.
- **Ramas y PR**: una rama por fase (`feat/...`) y un PR. El usuario fusiona y pide pasar a `main` y borrar la rama.
- **Commits** con gitmoji en código y en español: `:sparkles: feat: …`.
- **Diseño**: todo lo nuevo sigue la dirección D (`PageHeader` con banda, `HeroStat`, `font-data`, `FilterBar`, `Alert`, `LoadingBlock`).
- **Revisión visual en Chrome** en cada fase.
  - Antes, apagar todos los procesos node del proyecto filtrando por `Repos\camionera` (no solo por el puerto).
  - Verificar que una ruta nueva responda 401 y no 404.
- **e2e**: no correr `attendance.e2e-spec` con los datos demo cargados, porque cierra el día anterior para todos.
