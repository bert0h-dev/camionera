# Fase 1.6: Nómina base (prenómina)

**Estado:** ✅ Completada el 2026-10-27, con lo que se cierra el Módulo 1.

## Decisiones del usuario
- **Solo prenómina**: no incluye ISR, IMSS ni timbrado del CFDI; se exporta para el contador o el sistema de timbrado.
- **Periodicidad**: semanal (por defecto) o quincenal, según el empleado.
- **Cálculo según la LFT, automático**: horas extra dobles y triples, y prima dominical.
- **Retardos configurables**: con un check se activa el descuento y se define cuántos retardos equivalen a una falta.
- **Exportación** a CSV y a Excel.
- **Diseño**: todo lo nuevo sigue la dirección D (banda índigo, cifras flotantes, mono para datos).

## Base de datos (migración `add_payroll`)
- **`staff_compensations`**: historial de salario.
  - Campos: tipo (diario o mensual), importe, periodicidad y `effective_from`.
  - Para una fecha vale el registro más reciente.
- **`payroll_periods`**: nombre, periodicidad, fechas y estado (`draft` → `closed` → `paid`).
- **`payroll_entries`**: una línea por empleado y periodo.
  - Guarda una copia del salario usado, los conteos (días, faltas, medios días, retardos, extras, domingos) y los importes.
- **`payroll_adjustments`**: ajustes manuales, ya sea percepción o deducción, con su concepto e importe.
- **Settings**: `payroll.late_penalty_enabled` (false) y `payroll.lates_per_absence` (3).

## Reglas (`src/payroll/payroll-rules.ts`)
- **Salario diario**: si el sueldo es mensual, se divide entre 30. La hora normal es el diario ÷ 8.
- **Días pagables**: días del periodo − faltas − faltas por retardos − ½ × medios días. Los descansos y las faltas justificadas se pagan.
- **Horas extra**: se agrupan por semana (de lunes a domingo). Las primeras 9 h se pagan dobles y el resto triples (art. 67 y 68).
- **Prima dominical**: 25 % del salario diario por cada domingo trabajado (art. 71).
- **Cálculo en centavos enteros**: en la base de datos todo se guarda como `Decimal`.
- **Quién entra**: empleados no dados de baja antes del inicio del periodo, con salario vigente al cierre y con la **misma periodicidad** del periodo. Los activos sin salario aparecen como aviso.
- **Recalcular**: actualiza los conteos con las asistencias actuales y **conserva los ajustes manuales**.
- **Cerrar**: bloquea recalcular y ajustar. Solo una nómina cerrada se puede marcar como pagada.

## API (RRHH y admin)
| Método | Ruta |
|---|---|
| GET/POST | `/staff/:id/compensation` |
| GET/PATCH | `/payroll/settings` |
| GET/POST | `/payroll/periods` |
| GET/DELETE | `/payroll/periods/:id` (eliminar solo en borrador) |
| POST | `/payroll/periods/:id/generate` · `/close` · `/pay` |
| GET | `/payroll/periods/:id/export?format=csv\|xlsx` |
| POST | `/payroll/entries/:id/adjustments` |
| DELETE | `/payroll/adjustments/:id` |
| GET | `/payroll/me`: recibos del propio empleado (cualquier usuario ligado a un empleado) |

El supervisor no ve nómina. Todas las acciones quedan en la bitácora.

## Frontend
- **Nómina** (`/nomina`):
  - Cifras en la banda: neto del último periodo cerrado con tendencia, nóminas por pagar, borradores y la regla de retardos vigente.
  - Lista de periodos.
  - Modales "Nuevo periodo" (sugiere la semana o quincena anterior) y "Configuración" (check de retardos y su equivalencia).
- **Detalle** (`/nomina/:id`):
  - El periodo en ámbar mono y cifras de empleados, percepciones, deducciones y neto.
  - Aviso de quién no tiene salario.
  - Tabla por empleado en tipografía mono y una barra con el neto del periodo.
  - Acciones: calcular o recalcular, cerrar, marcar pagada y exportar a Excel o CSV.
  - Al hacer clic en una fila se abre el desglose con sus ajustes.
- **Ficha → pestaña "Nómina"** (RRHH y admin): salario vigente, salario diario, hora normal, periodicidad, historial y "Registrar cambio".
- **Inicio del empleado → "Mis recibos"**: el neto del último periodo y el detalle de cada recibo.

## Datos demo
`npm run seed:demo -w backend -- --payroll` agrega salarios a los empleados demo y una prenómina cerrada de la semana pasada, **sin tocar los demás datos demo**. Dos empleados quedan sin salario para que se vea el aviso.

## Pruebas
- **Unitarias**: 9 pruebas de reglas.
- **e2e**: 2 pruebas.
  - Flujo completo: salario → periodo → traslape → calcular → ajuste → recalcular sin perderlo → 403 al supervisor → cerrar (bloquea cambios) → CSV y Excel → recibo del empleado → pagada.
  - Configuración de retardos.
