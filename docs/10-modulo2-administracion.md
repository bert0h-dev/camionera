# Módulo 2: Administración del Sistema

**Estado:** ✅ Completado el 2026-10-27 (fases 2.1–2.4). Los respaldos (2.5) quedaron fuera por decisión del usuario.

## Decisiones del usuario
- **Correo**: recuperación de contraseña por correo con **Resend**. La clave va en `backend/.env` (`RESEND_API_KEY`, `MAIL_FROM`).
  - Sin dominio verificado, `onboarding@resend.dev` solo entrega a la dirección dueña de la cuenta de Resend.
- **Comisiones**: solo en **porcentaje**.
- **Respaldos**: fuera por ahora; la restauración se hace con Neon.
- **Logo de la empresa**: pospuesto hasta que exista almacenamiento de archivos (Módulo 6).

## 2.1 Usuarios y cuentas
- **Bloqueo temporal**: tras N intentos fallidos (`security.max_failed_logins`, 5) la cuenta se bloquea M minutos (`security.lockout_minutes`, 15). El admin puede desbloquearla antes.
- **Cambio obligatorio**: con una contraseña temporal del admin o "forzar cambio", el usuario va a `/cambiar-contrasena` antes de usar la app.
- **Mi cuenta** (`/mi-cuenta`): datos, cambio de contraseña (cierra las demás sesiones) y sesiones abiertas (cerrar una o las demás).
- **Recuperación** (`/recuperar` → correo → `/restablecer?token=`):
  - El enlace vence en 1 h, es de un solo uso y se permiten 3 solicitudes por hora.
  - La respuesta es idéntica exista o no la cuenta.
- **Ficha de usuario** (`/usuarios/:id`, admin): empleado ligado, sesiones, actividad, bloqueo y menú Seguridad.
- **Sesiones**: cada refresh token pertenece a una sesión (`session_started_at`, que se hereda al rotar).

## 2.2 Configuración general (`/configuracion`, admin)
- **Empresa**: razón social, nombre comercial, RFC (con formato), régimen, domicilio, teléfono, correo y sitio.
- **Impuestos**: IVA (16 %) y si las tarifas ya lo incluyen.
- **Comisiones**: vendedor en taquilla y cargo en línea, en %, con hasta 2 decimales.
- **Guardado**: `PATCH /settings` guarda una sección completa o nada.
- **Lectura**: `GET /settings/company` la puede leer cualquier usuario con sesión.

## 2.3 Parámetros operacionales (pestaña Parámetros)
- **Grupos**: turnos, asistencias, documentos, nómina, seguridad, bitácora, boletos (Módulo 6) y recorridos (Módulo 4).
- **Presentación**: etiquetas cortas, unidades y botón "Valores por defecto".
- **Permisos**: RRHH ve y edita solo documentos, turnos, asistencias y nómina; el backend rechaza los demás grupos.

## 2.4 Bitácora (`/bitacora`, admin)
- **Cambios de datos** (`audit_logs`):
  - Filtros por usuario, fechas, tabla y acción.
  - Detalle con la comparación antes/después campo por campo.
  - Exportación a CSV de hasta 10,000 filas.
- **Seguridad de acceso** (tabla nueva `security_events`): inicio de sesión exitoso y fallido (con motivo), bloqueo, desbloqueo, cierre de sesión, cambio, solicitud y restablecimiento de contraseña, sesiones cerradas y reutilización de token, con IP y navegador.
- **Cifras de 24 h**: cambios, inicios de sesión, intentos fallidos y bloqueos.
- **Retención**: `audit.retention_days` (365); cada noche a las 03:00 se depura lo más antiguo.

## Corrección importante: renovación concurrente de sesión
La bitácora reveló un error que existía desde la fase 1.0.
- **El problema**: si dos pestañas o peticiones renovaban la sesión casi a la vez con la misma cookie, la segunda se tomaba como robo de token y **se cerraban todas las sesiones del usuario**.
- **La solución**:
  - Nueva columna `refresh_tokens.rotated_at`.
  - Un token *rotado* hace menos de **30 s**, cuya sesión sigue abierta, se acepta como renovación concurrente.
  - Fuera de ese margen, o si la sesión se cerró a propósito, se sigue tratando como robo: se cierran todas las sesiones y se registra `token_reuse`.
- **Pruebas**: el e2e que probaba la reutilización con el admin ahora prueba el margen. El caso de robo se prueba con un usuario de prueba para no cerrar las sesiones del admin en cada corrida.

## Pruebas
- **Unitarias**: 55, incluidas las de validación de parámetros.
- **e2e**: 36 en 11 archivos.
  - Nuevos: `account` (bloqueo, contraseña temporal, sesiones, recuperación, renovación concurrente), `settings` (sección completa o nada, lectura pública, permisos de RRHH) y `audit` (eventos, filtros, resumen, CSV, depuración).
  - El de asistencias no se corre con los datos demo cargados, porque cierra el día anterior para todos.
