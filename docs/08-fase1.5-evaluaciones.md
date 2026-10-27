# Fase 1.5: Evaluaciones de desempeño

**Estado:** ✅ Completada el 2026-10-27

## Decisiones del usuario
- Escala de **1 a 5** por criterio, con **pesos** (1–10) por criterio.
- El **periodo es libre**. El frontend propone los últimos 6 meses; no hay setting para esto.
- **El empleado ve** sus evaluaciones una vez finalizadas y puede marcar "enterado" con un comentario opcional.
- **Supervisor y RRHH** evalúan y ven. El coordinador solo lee. Nadie se evalúa a sí mismo.

## Base de datos (migración `add_staff_evaluations`)
- **`evaluation_criteria`**: tiene nombre único, descripción, peso, `applies_to StaffRole[]` (vacío = todos), `is_active` y `sort_order`. Los criterios no se borran, se desactivan.
- **`staff_evaluations`**:
  - Tiene el empleado, el evaluador (→ `users`, porque el admin puede no ser empleado), el periodo y el estado (`draft` → `finalized` → `acknowledged`).
  - Guarda el promedio `overall_score` decimal(3,2), fortalezas, áreas de mejora, comentarios y el comentario del empleado, con sus fechas.
- **`staff_evaluation_scores`**: guarda una calificación por evaluación y criterio, con una **copia del nombre y del peso**. Si se edita el catálogo después, las evaluaciones viejas no cambian.
- **Seed**: Puntualidad y asistencia (2), Trato al pasajero (2), Trabajo en equipo (1), Cumplimiento de procedimientos (2). Solo para conductores: Manejo seguro (3) y Cuidado de la unidad (2).

## Reglas (`evaluation-rules.ts`)
- **Promedio**: ponderado, redondeado a 2 decimales; queda en null mientras falte alguna calificación.
- **Criterios de cada evaluación**: al crearla se copian los criterios **activos** que aplican al puesto del empleado.
- **Finalizar**: exige todas las calificaciones. Después de finalizar, ya no se puede editar ni borrar.
- **Periodos**: no puede haber dos evaluaciones del mismo empleado con periodos traslapados (responde 409).
- **Bajas**: no se puede evaluar a un empleado dado de baja.

## API
| Método | Ruta | Roles |
|---|---|---|
| GET | `/evaluation-criteria?includeInactive=` | hr, supervisor, coordinator |
| POST/PATCH | `/evaluation-criteria[/:id]` | hr |
| GET | `/evaluations` (staffId, status, from, to, search, paginación) | hr, supervisor, coordinator |
| GET | `/evaluations/:id` (incluye el resumen de asistencia del periodo) | hr, supervisor, coordinator |
| POST | `/evaluations` | hr, supervisor |
| PATCH | `/evaluations/:id` (solo en borrador) | hr, supervisor |
| POST | `/evaluations/:id/finalize` | hr, supervisor |
| DELETE | `/evaluations/:id` (solo en borrador) | hr, supervisor |
| GET | `/evaluations/me` | cualquier usuario ligado a un empleado |
| POST | `/evaluations/me/:id/acknowledge` | el propio empleado |

El admin siempre pasa. Todas las acciones quedan en auditoría.

## Frontend
- **`/evaluaciones`**: lista con búsqueda y filtro por estado. Botones "Nueva evaluación" y "Criterios" (este último para RRHH y admin).
- **`/evaluaciones/:id`**:
  - Botones del 1 al 5 por criterio, con comentario.
  - El promedio se actualiza en vivo.
  - Panel con la asistencia del periodo.
  - Acciones: guardar borrador, finalizar (con confirmación) y eliminar borrador.
- **Ficha del empleado → "Evaluaciones"**: historial, tendencia de promedios y botón para crear una evaluación de ese empleado.
- **Inicio → "Mis evaluaciones"**: el empleado ve las suyas y el aviso de las nuevas, y puede marcar "enterado".

## Pruebas
- **Unitarias**: 7 pruebas de reglas.
- **e2e**: 3 pruebas.
  - Catálogo por puesto y desactivación.
  - Ciclo completo con traslape, validaciones, bloqueo después de finalizar y "enterado".
  - Supervisor: no puede evaluarse a sí mismo ni administrar el catálogo, y sí puede borrar un borrador.

## Pendientes y notas
- **Supervisor**: puede *ver* su propia evaluación mientras está en borrador desde la lista (solo lectura). Si se quiere ocultar, se filtra en `findAll`/`findOne`.
- **Navegador**: la UI no se ha probado en un navegador real.
