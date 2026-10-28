# Parámetros organizados por módulo

**Motivo:** la pestaña *Configuración → Parámetros* mostraba una cuadrícula de tarjetas que crecía con cada fase y mezclaba Personal, Flota, Sistema y módulos que aún no existen. Se reorganizó para encontrar un parámetro rápido. Solo cambia el frontend: las claves y los valores guardados son los mismos.

## Estructura
- **Módulos**, en este orden:
  - **Personal**: Turnos, Asistencias, Documentos del personal y Nómina.
  - **Flota**: Documentos de unidades.
  - **Sistema**: Seguridad de acceso y Bitácora.
  - **Próximamente**: Recorridos (Módulo 5) y Boletos (Módulo 6). Va colapsado y atenuado porque aún no se aplica.
- **Navegación**: un menú lateral fijo con los módulos y sus grupos; en pantallas chicas se vuelve una fila de chips. Cada enlace salta a su tarjeta y, si está en "Próximamente", la abre.
- **Buscador**: filtra por nombre o descripción del parámetro, o por título del grupo, sin distinguir acentos ni mayúsculas. Los campos que no coinciden se ocultan sin perder lo que se esté editando.
- **Modificado**: cada parámetro con un valor distinto del de fábrica lleva esa etiqueta, y el menú muestra cuántos hay modificados por módulo.
- Las tarjetas van en una sola columna; cada una se sigue guardando por separado.

## Para módulos futuros
- Un grupo nuevo se declara en `GROUPS` (`frontend/src/pages/settings/ParametersTab.tsx`) con su `module`. El grupo es el prefijo de la clave en `backend/src/settings/settings.registry.ts`.
- Un módulo nuevo se agrega en `MODULES`. Cuando un módulo de "Próximamente" entre en operación, sus grupos pasan a su módulo real.
- Los umbrales de Flota (mantenimiento próximo 7 días / 1000 km y rendimiento −15 %) se agregarán como parámetros en sus fases (3.3 y 3.4).
