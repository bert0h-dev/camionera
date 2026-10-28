<div align="center">

# 🚌 Central Camionera

**Sistema integral de gestión para centrales de autobuses**

Personal · Flota · Rutas · Recorridos · Boletos · Reportes

![Node](https://img.shields.io/badge/Node-24-339933?logo=nodedotjs&logoColor=white) ![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white) ![gitmoji](https://img.shields.io/badge/gitmoji-%20😜%20😍-FFDD67.svg)

</div>

---

## 📋 Tabla de contenido

- [Acerca del proyecto](#-acerca-del-proyecto)
- [Avance](#-avance)
- [Stack tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Estructura del repositorio](#-estructura-del-repositorio)
- [Primeros pasos](#-primeros-pasos)
- [Scripts](#-scripts)
- [Variables de entorno](#-variables-de-entorno)
- [Base de datos](#-base-de-datos)
- [Roles y permisos](#-roles-y-permisos)
- [Pruebas](#-pruebas)
- [Convenciones](#-convenciones)
- [Documentación](#-documentación)

---

## 🎯 Acerca del proyecto

**Central Camionera** es una plataforma web para administrar la operación completa de una central de autobuses: desde el personal y sus turnos hasta la venta de boletos, la flota y los reportes operativos.

El desarrollo avanza **por módulos**, siguiendo las reglas de negocio definidas en [`contexto/`](contexto/), y cada fase se documenta en [`docs/`](docs/).

---

## 📈 Avance

|  #  | Módulo                     |          Estado          |
| :-: | -------------------------- | :----------------------: |
|  1  | **Gestión de Personal**        | ✅ Completado |
|  2  | **Administración del Sistema** | ✅ Completado |
|  3  | **Gestión de Flota**           | ✅ Completado |
|  4  | **Gestión de Rutas**           | 🚧 En curso   |
|  5  | Gestión de Recorridos          | ⏳ Pendiente  |
|  6  | Gestión de Boletos             | ⏳ Pendiente  |
|  7  | Reportes y Analytics           | ⏳ Pendiente  |

Además de los módulos, la app tiene un **Inicio** ordenado por rol (cifras clave, una sola lista de **Pendientes** y pestañas por área), un **buscador Ctrl+K** con acciones rápidas y un rediseño visual aplicado a todas las pantallas.

### Módulo 1: Gestión de Personal

| Fase | Funcionalidad | Estado |
| :-: | --- | :-: |
| 1.0 | **Autenticación y usuarios**: JWT, refresh token rotativo, roles, auditoría | ✅ |
| 1.1 | **Empleados**: expediente, número de empleado, bajas, acceso al sistema | ✅ |
| 1.2 | **Licencias y certificaciones**: vigencias y alertas de vencimiento configurables | ✅ |
| 1.3 | **Turnos**: plantillas, programación semanal y masiva, validación NOM-087 / LFT | ✅ |
| 1.4 | **Asistencias**: autoregistro, retardos, horas extra, cierre diario automático | ✅ |
| 1.5 | **Evaluaciones de desempeño**: criterios ponderados por puesto, flujo con "enterado" | ✅ |
| 1.6 | **Prenómina**: salarios con historial, cálculo LFT (extras, prima dominical), retardos configurables, exportación CSV/Excel | ✅ |

### Módulo 2: Administración del Sistema

| Fase | Funcionalidad | Estado |
| :-: | --- | :-: |
| 2.1 | **Usuarios y cuentas**: bloqueo por intentos fallidos, cambio obligatorio de contraseña, recuperación por correo, sesiones abiertas y "Mi cuenta" | ✅ |
| 2.2 | **Configuración general**: datos de la empresa, impuestos y comisiones | ✅ |
| 2.3 | **Parámetros operacionales**: organizados por módulo, con buscador y valores por defecto | ✅ |
| 2.4 | **Bitácora**: cambios de datos y eventos de seguridad de acceso | ✅ |
| 2.5 | Respaldos | ➖ Fuera por decisión; se usa la restauración de Neon |

### Módulo 3: Gestión de Flota

| Fase | Funcionalidad | Estado |
| :-: | --- | :-: |
| 3.0 | **Catálogos y modelos**: ciudades, terminales con ubicación en mapa, combustibles y modelos con editor visual de asientos | ✅ |
| 3.1 | **Unidades**: asientos copiados del modelo, documentos con vencimiento, odómetro y regla de unidad apta | ✅ |
| 3.2 | **Mantenimiento**: órdenes preventivas y correctivas, plan por km y días, rol de mecánico | ✅ |
| 3.3 | **Incidencias**: reportes del conductor, gravedad crítica que saca la unidad de servicio, orden correctiva ligada | ✅ |
| 3.4 | **Combustible**: cargas con confirmación de coordinación y rendimiento de tanque lleno a tanque lleno con alerta | ✅ |

### Módulo 4: Gestión de Rutas

| Fase | Funcionalidad | Estado |
| :-: | --- | :-: |
| 4.1 | **Rutas**: terminal a terminal, clave única, activar y desactivar; zona horaria por ciudad para calcular llegadas entre estados | ✅ |
| 4.2 | **Horarios**: alta de varias salidas a la vez, días, vigencia sin choques, vista semanal y llegada en hora local del destino | ✅ |
| 4.3 | **Paradas**: orden, tiempo desde el origen y precio adicional | ⏳ |
| 4.4 | **Temporadas**: modificadores globales sin solapes; precio redondeado a peso entero | ⏳ |
| 4.5 | **Búsqueda**: rutas entre ciudades con horarios y precio vigente | ⏳ |

---

## 🛠 Stack tecnológico

### Backend

| Tecnología | Uso |
| --- | --- |
| **NestJS 12** (ESM) | Framework de la API REST |
| **Prisma 7** + `@prisma/adapter-pg` | ORM y migraciones |
| **PostgreSQL** en **Neon** | Base de datos serverless |
| `@nestjs/jwt` + **argon2** | Autenticación y hash de contraseñas |
| `@nestjs/schedule` | Tareas programadas (cierre diario de asistencias) |
| **Resend** | Correos de recuperación de contraseña |
| `class-validator` | Validación de DTOs con mensajes en español |
| **Swagger** | Documentación interactiva de la API |
| **Vitest** + Supertest | Pruebas unitarias y e2e |

### Frontend

| Tecnología | Uso |
| --- | --- |
| **React 19** + **Vite 8** | SPA |
| **Tailwind CSS 4** | Estilos |
| **React Router 7** | Ruteo con rutas protegidas por rol |
| **TanStack Query 5** | Estado del servidor y caché |
| **React Hook Form** + **Zod 4** | Formularios y validación |
| **Axios** | Cliente HTTP con renovación automática de sesión |
| **Leaflet** + OpenStreetMap | Mapas de terminales (búsqueda de direcciones con Nominatim) |
| **lucide-react** | Iconos |

### Herramientas

**npm workspaces** · **oxlint** · **Prettier** · **concurrently**

---

## 🏗 Arquitectura

```
┌──────────────────────┐        /api (proxy Vite)       ┌──────────────────────┐
│   Frontend (React)   │  ───────────────────────────▶  │   Backend (NestJS)   │
│   localhost:5173     │  ◀───────────────────────────  │   localhost:3002     │
└──────────────────────┘   JWT + cookie httpOnly        └──────────┬───────────┘
                                                                   │ Prisma
                                                                   ▼
                                                       ┌──────────────────────┐
                                                       │  PostgreSQL (Neon)   │
                                                       └──────────────────────┘
```

**Puntos clave**

- 🔐 **Sesión segura**:
  - El _access token_ (15 min) vive solo en memoria.
  - El _refresh token_ va en una cookie `httpOnly`, se guarda hasheado, rota en cada uso y detecta si se reutiliza.
  - La cuenta se bloquea por intentos fallidos y los eventos de acceso quedan en `security_events`.
- 🛡 **Autorización global**:
  - Todas las rutas requieren sesión, salvo las marcadas con `@Public()`.
  - `@Roles(...)` restringe por rol; `admin` siempre pasa.
- 📜 **Auditoría**: los cambios relevantes quedan registrados en `audit_logs`, con los valores anteriores y nuevos.
- ⚙️ **Parámetros configurables**: tolerancias, horas máximas y umbrales de alerta viven en `system_settings`, con valores por defecto tipados (`settings.registry.ts`). El admin los edita todos; RR. HH., solo los de su área.
- 📌 **Pendientes**: lo que hay que atender de cada área (documentos, preventivos, incidencias, combustible) sale en una sola lista en Inicio (`PendingService`), según el rol.
- 🕒 **Zona horaria**: las reglas de negocio se calculan en `America/Mexico_City`; las fechas se guardan como `timestamptz`.

---

## 📁 Estructura del repositorio

```
camionera/
├── backend/                  # API NestJS
│   ├── prisma/
│   │   ├── schema.prisma     # Modelo de datos
│   │   ├── migrations/       # Historial de migraciones
│   │   ├── seed.ts           # Datos base (admin, plantillas, catálogos)
│   │   └── seed-demo.ts      # Datos de demostración
│   ├── src/
│   │   ├── auth/             # Login, refresh, guards, recuperación
│   │   ├── users/            # Usuarios del sistema
│   │   ├── staff/            # Módulo 1: empleados
│   │   │   ├── documents/    #   licencias y certificaciones
│   │   │   ├── schedules/    #   turnos y plantillas
│   │   │   ├── attendance/   #   asistencias
│   │   │   └── evaluations/  #   evaluaciones de desempeño
│   │   ├── payroll/          # Módulo 1: prenómina
│   │   ├── fleet/            # Módulo 3: catálogos, unidades, mantenimiento, incidencias, combustible
│   │   ├── dashboard/        # Inicio: cifras, pendientes y preferencias
│   │   ├── settings/         # Configuración general y parámetros
│   │   ├── audit/            # Bitácora de cambios
│   │   ├── mail/             # Envío de correos (Resend)
│   │   ├── health/           # Estado de la API
│   │   └── common/           # Decoradores, filtros, validación, fechas
│   └── test/                 # Pruebas e2e
├── frontend/                 # SPA React
│   └── src/
│       ├── auth/             # Contexto de sesión y rutas protegidas
│       ├── components/       # UI reutilizable y layout
│       ├── lib/              # API, tipos, formato, validación
│       └── pages/            # Pantallas por módulo
├── contexto/                 # Reglas de negocio y diseño original de la BD
└── docs/                     # Planes y bitácora de cada fase
```

---

## 🚀 Primeros pasos

### Requisitos

- **Node.js 24+** y **npm 11+**
- Una base de datos **PostgreSQL** (recomendado: un proyecto en [Neon](https://neon.tech))

### Instalación

```bash
# 1. Clonar
git clone git@github.com:bert0h-dev/camionera.git
cd camionera

# 2. Instalar dependencias (genera también el cliente de Prisma)
npm install

# 3. Configurar el entorno
cp backend/.env.example backend/.env
#    → edita backend/.env con tus URLs de Neon y secretos

# 4. Crear las tablas y datos base
cd backend
npx prisma migrate deploy
npx prisma db seed
cd ..

# 5. Levantar backend y frontend
npm run dev
```

| Servicio     | URL                            |
| ------------ | ------------------------------ |
| 🖥 Aplicación | http://localhost:5173          |
| 🔌 API       | http://localhost:3002/api      |
| 📚 Swagger   | http://localhost:3002/api/docs |

Inicia sesión con el admin definido en `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

---

## 📜 Scripts

### Raíz

| Comando             | Descripción                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Backend y frontend en paralelo, en modo desarrollo |
| `npm run dev:back`  | Solo el backend (watch)                            |
| `npm run dev:front` | Solo el frontend                                   |
| `npm run build`     | Compila ambos proyectos                            |
| `npm run lint`      | Lint de ambos proyectos                            |

### Backend (`npm run <script> -w backend`)

| Comando           | Descripción                                   |
| ----------------- | --------------------------------------------- |
| `test`            | Pruebas unitarias                             |
| `test:e2e`        | Pruebas e2e contra la base de datos de `.env` |
| `test:cov`        | Cobertura                                     |
| `prisma:migrate`  | Crea o aplica migraciones en desarrollo       |
| `prisma:generate` | Regenera el cliente de Prisma                 |
| `prisma:seed`     | Carga los datos base                          |
| `seed:demo`       | Datos de demostración (`-- --clean` los borra, `-- --payroll` solo agrega la nómina demo, `-- --fleet` solo agrega la flota demo, `-- --routes` solo las rutas demo) |
| `start:prod`      | Ejecuta la build de producción                |

> ⚠️ Después de cada `prisma migrate dev` ejecuta `npx prisma generate`; no se regenera solo.

---

## 🔑 Variables de entorno

Archivo `backend/.env` (plantilla en [`backend/.env.example`](backend/.env.example)):

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto de la API (por defecto `3002`) |
| `FRONTEND_URL` | Origen permitido por CORS |
| `DATABASE_URL` | Conexión **con pooler**, usada por la aplicación |
| `DIRECT_URL` | Conexión **directa**, usada por las migraciones |
| `JWT_ACCESS_SECRET` | Secreto para firmar los access tokens |
| `JWT_ACCESS_TTL` | Vigencia del access token |
| `JWT_REFRESH_TTL_DAYS` | Vigencia del refresh token, en días |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Administrador inicial |
| `RESEND_API_KEY` | Llave de Resend para enviar correos |
| `MAIL_FROM` | Remitente de los correos (requiere un dominio verificado en Resend) |

> 🔒 **Nunca** subas `.env` al repositorio; ya está en `.gitignore`.

---

## 🗄 Base de datos

- **Llaves primarias**: `uuid v7`, ordenables por tiempo.
- **Fechas**: `timestamptz` para fechas con hora y `date` para fechas puras.
- **Migraciones**: versionadas en `backend/prisma/migrations/`.
- **Seed** (`backend/prisma/seed.ts`): es idempotente. Crea el admin, las plantillas de turno (Matutino, Vespertino y Nocturno), los criterios de evaluación, los combustibles, las tareas base del preventivo y las categorías de incidencia.

| Área | Tablas |
| --- | --- |
| Acceso | `users`, `refresh_tokens`, `password_resets` |
| Personal | `staff`, `staff_licenses`, `staff_certifications` |
| Turnos y asistencia | `shift_templates`, `staff_schedules`, `staff_attendance` |
| Evaluaciones | `evaluation_criteria`, `staff_evaluations`, `staff_evaluation_scores` |
| Nómina | `staff_compensations`, `payroll_periods`, `payroll_entries`, `payroll_adjustments` |
| Catálogos de flota | `cities`, `terminals`, `fuel_types`, `bus_models` |
| Unidades | `buses`, `bus_seats`, `bus_documents`, `odometer_readings` |
| Mantenimiento | `maintenance_orders`, `maintenance_tasks`, `maintenance_task_templates` |
| Incidencias y combustible | `incident_categories`, `bus_incidents`, `fuel_loads` |
| Rutas | `routes`, `route_stops`, `route_schedules`, `seasons` |
| Sistema | `system_settings`, `audit_logs`, `security_events` |

---

## 👥 Roles y permisos

| Rol | Alcance |
| --- | --- |
| `admin` | Acceso total, usuarios, configuración y bitácora |
| `hr` | Recursos Humanos: expedientes, turnos, asistencias, evaluaciones, nómina y los parámetros de su área |
| `supervisor` | Personal: turnos, asistencias y evaluaciones (no a sí mismo). Flota: consulta y atiende incidencias. Rutas: consulta |
| `coordinator` | Personal: consulta. Flota: administra unidades, mantenimiento, incidencias y combustible. Rutas: las administra |
| `mechanic` | Sus órdenes de trabajo; reporta incidencias |
| `driver` | Autoservicio; reporta incidencias y registra cargas de combustible (por confirmar) |
| `vendor` | Taquilla: consulta las rutas; autoservicio |
| `collector`, `viewer` | Autoservicio: mi turno, mi asistencia y mis evaluaciones |

El **puesto** del empleado (`StaffRole`) es independiente del **rol de sistema** (`UserRole`). El rol de sistema se sugiere a partir del puesto al otorgar acceso.

---

## 🧪 Pruebas

```bash
npm run test -w backend       # unitarias
npm run test:e2e -w backend   # e2e (requiere BD y seed)
```

- **Unitarias**: cubren las reglas de negocio puras (turnos, asistencia, evaluaciones, nómina, asientos, unidades, mantenimiento, incidencias y combustible).
- **e2e**:
  - Levantan la app completa contra la base de datos de `.env`.
  - Se ejecutan en serie y limpian los datos que crean.
  - Se recomienda usar una **rama de Neon** dedicada a pruebas.
  - Con los datos demo cargados no corras `attendance.e2e-spec`: cierra el día anterior para todos.

---

## 📐 Convenciones

### Commits: [gitmoji](https://gitmoji.dev) + Conventional Commits

Formato: **código gitmoji** + **tipo** + mensaje **en español**.

```
:gitmoji: tipo(alcance opcional): descripción en español
```

```
:sparkles: feat: fase 1.6 nómina base
:bug: fix: cálculo de retardos en turno nocturno
:card_file_box: feat(db): tabla de periodos de nómina
```

| Gitmoji | Código | Tipo | Cuándo usarlo |
| :-: | --- | --- | --- |
| 🎉 | `:tada:` | `chore` | Commit inicial |
| ✨ | `:sparkles:` | `feat` | Nueva funcionalidad |
| 🐛 | `:bug:` | `fix` | Corrección de un bug |
| 🚑️ | `:ambulance:` | `fix` | Corrección urgente (hotfix) |
| ♻️ | `:recycle:` | `refactor` | Refactorización sin cambio funcional |
| ⚡️ | `:zap:` | `perf` | Mejora de rendimiento |
| 💄 | `:lipstick:` | `style` | UI y estilos |
| 🗃️ | `:card_file_box:` | `feat(db)` | Esquema, migraciones o seed |
| ✅ | `:white_check_mark:` | `test` | Agregar o actualizar pruebas |
| 📝 | `:memo:` | `docs` | Documentación |
| 🔧 | `:wrench:` | `chore` | Configuración |
| ⬆️ | `:arrow_up:` | `chore(deps)` | Actualizar dependencias |
| ➕ | `:heavy_plus_sign:` | `chore(deps)` | Agregar una dependencia |
| ➖ | `:heavy_minus_sign:` | `chore(deps)` | Quitar una dependencia |
| 🔒️ | `:lock:` | `fix` / `feat` | Seguridad |
| 🔥 | `:fire:` | `chore` | Eliminar código o archivos |
| 🚚 | `:truck:` | `refactor` | Mover o renombrar archivos |
| 🚨 | `:rotating_light:` | `style` | Corregir advertencias del linter |
| 🌐 | `:globe_with_meridians:` | `feat` | Traducciones o textos |
| 🚀 | `:rocket:` | `chore` | Despliegue |

> Se usa el **código** (`:sparkles:`) y no el emoji directo, para mantener un estándar en texto plano.

### Código

- **Idioma**: código e identificadores en inglés; textos de UI, mensajes de error y documentación en español.
- **Backend**: módulos por dominio. Las reglas de negocio puras viven en `*-rules.ts` con pruebas unitarias, y la auditoría se registra explícitamente desde los servicios.
- **Frontend**: Prettier con `--print-width 120 --no-semi --single-quote`. Los modales montan su formulario solo mientras están abiertos.
- **Calidad**: antes de cada commit deben pasar `npm run lint`, `npm run build` y las pruebas.

---

## 📚 Documentación

| Carpeta | Contenido |
| --- | --- |
| [`contexto/`](contexto/) | Visión del negocio, reglas y diseño original de la BD |
| [`docs/`](docs/) | Planes y bitácora de cada fase y módulo (`00`–`14`). El [`11`](docs/11-estado-y-siguientes-pasos.md) resume el estado actual y lo que sigue |
| `/api/docs` | Swagger de la API, con el backend en ejecución |

---

<div align="center">
<sub>Hecho con ☕ para la operación diaria de una central camionera.</sub>
</div>
