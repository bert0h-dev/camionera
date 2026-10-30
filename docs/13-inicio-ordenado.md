# Inicio reorganizado

**Motivo:** con cada módulo, Inicio se llenaba de paneles sueltos (documentos del personal, documentos de unidades, preventivos…) y se volvía difícil de leer. Se reorganizó en lugar de hacerlo totalmente configurable; encima va una personalización ligera.

## Estructura
1. **Banda**: 4 cifras como máximo, según el rol.
   - Admin, coordinación y supervisión: en turno ahora, asistencia de hoy, unidades disponibles y pendientes.
   - RR. HH.: en turno, asistencia, sin registrar entrada y pendientes.
   - Mecánico: órdenes en proceso y programadas.
2. **Pendientes**: una sola lista con todo lo que hay que atender, ordenada por urgencia (vencidos primero, luego por días restantes).
   - Áreas: documentos del personal, documentos de unidades, preventivos vencidos o próximos, incidencias abiertas y combustible (unidades con rendimiento bajo y, solo para coordinación y admin, cargas del conductor por confirmar) y rutas (desde la 4.2, solo admin y coordinación: rutas activas sin horarios vigentes y horarios por vencer).
   - Muestra 6 y "Ver todos (n)". Filtros Todo / Personal / Flota / Rutas y recorridos / Caja (desde la 6.3: cajas sin corte y cortes con diferencia, para supervisión y admin): solo aparecen los que tienen pendientes, y la barra se muestra cuando hay al menos dos.
   - Endpoint: `GET /dashboard/pending` (`backend/src/dashboard/pending.service.ts`). Cada rol recibe solo sus áreas.
3. **Mi información**: los datos propios del empleado (turno, mes, evaluaciones y recibos), si el usuario está ligado a uno.
4. **Mis órdenes de trabajo**: solo para el mecánico.
5. **Pestañas por área**: *Personal* (tablero de entradas, asistencia de 7 días y puestos), *Flota* (estado de unidades y taller) y *Recorridos* (avance del día por estado, lo que está en operación y las próximas salidas; desde la 5.4). La pestaña elegida se recuerda en el navegador.

Los paneles de vencimientos sueltos se retiraron: ahora son parte de Pendientes. El cuadro "Requiere atención" del tablero de personal ya no repite los documentos.

## Personalizar
- El botón "Personalizar" en la banda muestra u oculta secciones: Pendientes, Mi información, Personal, Flota, Recorridos y Mis órdenes.
- Se guarda **por usuario en el servidor**: columna `users.preferences` (JSONB), clave `home.hiddenSections`, con `GET|PUT /dashboard/preferences`. Te sigue en cualquier equipo.
- "Restablecer" vuelve a mostrar todo.

## Para módulos futuros
- Un tipo de pendiente nuevo se agrega en `PendingService` (área, severidad, título, detalle, fecha y enlace).
- Un área nueva (rutas, boletos) se agrega como pestaña en `HomePage` y como sección en `HOME_SECTIONS`.

## Pruebas
- `test/home.e2e-spec.ts`: orden por urgencia, áreas por rol y guardado de preferencias.
