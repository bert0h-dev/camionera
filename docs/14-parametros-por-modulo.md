# Parámetros organizados por módulo

**Motivo:** la pestaña *Configuración → Parámetros* mostraba una cuadrícula de tarjetas que crecía con cada fase y mezclaba Personal, Flota, Sistema y módulos que aún no existen. Se reorganizó para encontrar un parámetro rápido. Solo cambia el frontend: las claves y los valores guardados son los mismos.

## Estructura
- **Módulos**, en este orden:
  - **Personal**: Turnos, Asistencias, Documentos del personal y Nómina.
  - **Flota**: Alertas de flota (aviso de documentos de unidades por vencer, umbrales de preventivo próximo en días y km, y rendimiento de combustible bajo en %). Se llamaba "Documentos de unidades"; el cambio de nombre quedó pendiente en la 3.3 y se aplicó en la 3.4.
  - **Rutas**: Horarios de ruta (`routes.schedule_expiry_alert_days`, 7 días: aviso en Pendientes de los horarios cuya vigencia termina). Desde la 4.2.
  - **Sistema**: Seguridad de acceso y Bitácora.
  - **Recorridos**: días generados por adelantado y descansos entre recorridos (Módulo 5).
  - **Boletos**: Venta de boletos (`tickets.*`: apartado en taquilla y en línea, cargo por cambio, cancelación, reembolso, check-in y boletos por compra) y **Caja** (`cash.*`: fondo propuesto, tolerancia del corte y aviso de caja abierta; desde la 6.3) y, debajo, el catálogo **Tipos de pasajero** (desde la 6.0). Los parámetros se aplican conforme entran las fases del Módulo 6.
  - **Próximamente**: hoy vacío. Si un módulo futuro adelanta parámetros, va aquí colapsado y atenuado.
- **Navegación**: un menú lateral fijo con los módulos y sus grupos; en pantallas chicas se vuelve una fila de chips. Cada enlace salta a su tarjeta y, si está en "Próximamente", la abre.
- **Buscador**: filtra por nombre o descripción del parámetro, o por título del grupo, sin distinguir acentos ni mayúsculas. Los campos que no coinciden se ocultan sin perder lo que se esté editando.
- **Modificado**: cada parámetro con un valor distinto del de fábrica lleva esa etiqueta, y el menú muestra cuántos hay modificados por módulo.
- Las tarjetas van en una sola columna; cada una se sigue guardando por separado.

## Para módulos futuros
- Un grupo nuevo se declara en `GROUPS` (`frontend/src/pages/settings/ParametersTab.tsx`) con su `module`. El grupo es el prefijo de la clave en `backend/src/settings/settings.registry.ts`.
- Un módulo nuevo se agrega en `MODULES`. Cuando un módulo de "Próximamente" entre en operación, sus grupos pasan a su módulo real.
- Los umbrales de mantenimiento próximo (7 días / 1000 km) ya son parámetros desde la 3.2 (`fleet.maintenance_alert_days` y `fleet.maintenance_alert_km`). El de rendimiento de combustible bajo (15 %) es `fleet.fuel_efficiency_alert_pct` desde la 3.4.
- Formato del frontend: no hay `.prettierrc`; se formatea con `npx prettier --single-quote --no-semi --print-width 120`. Sin esas opciones Prettier mete comillas dobles y punto y coma (pasó en este PR y se corrigió en la 3.3).
