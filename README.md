<div align="center">

# 🚌 Central Camionera

**Sistema integral de gestión para centrales de autobuses**

Personal · Rutas · Recorridos · Flota · Boletos · Reportes

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
|  1  | **Gestión de Personal**    | 🚧 En curso (1.0–1.5 ✅) |
|  2  | Administración del Sistema |       ⏳ Pendiente       |
|  3  | Gestión de Rutas           |       ⏳ Pendiente       |
|  4  | Gestión de Recorridos      |       ⏳ Pendiente       |
|  5  | Gestión de Flota           |       ⏳ Pendiente       |
|  6  | Gestión de Boletos         |       ⏳ Pendiente       |
|  7  | Reportes y Analytics       |       ⏳ Pendiente       |

### Módulo 1: Gestión de Personal

| Fase | Funcionalidad | Estado |
| :-: | --- | :-: |
| 1.0 | **Autenticación y usuarios**: JWT, refresh token rotativo, roles, auditoría | ✅ |
| 1.1 | **Empleados**: expediente, número de empleado, bajas, acceso al sistema | ✅ |
| 1.2 | **Licencias y certificaciones**: vigencias y alertas de vencimiento configurables | ✅ |
| 1.3 | **Turnos**: plantillas, programación semanal y masiva, validación NOM-087 / LFT | ✅ |
| 1.4 | **Asistencias**: autoregistro, retardos, horas extra, cierre diario automático | ✅ |
| 1.5 | **Evaluaciones de desempeño**: criterios ponderados por puesto, flujo con "enterado" | ✅ |
| 1.6 | **Nómina base** a partir de asistencias | ⏳ |

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
- 🛡 **Autorización global**:
  - Todas las rutas requieren sesión, salvo las marcadas con `@Public()`.
  - `@Roles(...)` restringe por rol; `admin` siempre pasa.
- 📜 **Auditoría**: los cambios relevantes quedan registrados en `audit_logs`, con los valores anteriores y nuevos.
- ⚙️ **Parámetros configurables**: tolerancias, horas máximas y días de alerta viven en `system_settings`, tienen valores por defecto tipados y solo el admin los edita.
- 🕒 **Zona horaria**: las reglas de negocio se calculan en `America/Mexico_City`; las fechas se guardan como `timestamptz`.

---

## 📁 Estructura del repositorio

```
camionera/
├── backend/                  # API NestJS
│   ├── prisma/
│   │   ├── schema.prisma     # Modelo de datos
│   │   ├── migrations/       # Historial de migraciones
│   │   └── seed.ts           # Admin, plantillas de turno y criterios base
│   ├── src/
│   │   ├── auth/             # Login, refresh, guards
│   │   ├── users/            # Usuarios del sistema
│   │   ├── staff/            # Módulo 1: empleados
│   │   │   ├── documents/    #   licencias y certificaciones
│   │   │   ├── schedules/    #   turnos y plantillas
│   │   │   ├── attendance/   #   asistencias
│   │   │   └── evaluations/  #   evaluaciones de desempeño
│   │   ├── settings/         # Parámetros configurables
│   │   ├── audit/            # Bitácora de cambios
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

> 🔒 **Nunca** subas `.env` al repositorio; ya está en `.gitignore`.

---

## 🗄 Base de datos

- **Llaves primarias**: `uuid v7`, ordenables por tiempo.
- **Fechas**: `timestamptz` para fechas con hora y `date` para fechas puras.
- **Migraciones**: versionadas en `backend/prisma/migrations/`.
- **Seed** (`backend/prisma/seed.ts`): es idempotente. Crea el admin, las plantillas de turno (Matutino, Vespertino y Nocturno) y los criterios de evaluación base.

| Área | Tablas |
| --- | --- |
| Acceso | `users`, `refresh_tokens`, `password_resets` |
| Personal | `staff`, `staff_licenses`, `staff_certifications` |
| Turnos y asistencia | `shift_templates`, `staff_schedules`, `staff_attendance` |
| Evaluaciones | `evaluation_criteria`, `staff_evaluations`, `staff_evaluation_scores` |
| Sistema | `system_settings`, `audit_logs` |

---

## 👥 Roles y permisos

| Rol | Alcance |
| --- | --- |
| `admin` | Acceso total, usuarios y configuración |
| `hr` | Recursos Humanos: expedientes, turnos, asistencias, evaluaciones y criterios |
| `supervisor` | Turnos, registro de asistencias y evaluaciones (no a sí mismo) |
| `coordinator` | Consulta del personal y su operación |
| `driver`, `collector`, `vendor`, `viewer` | Autoservicio: mi turno, mi asistencia y mis evaluaciones |

El **puesto** del empleado (`StaffRole`) es independiente del **rol de sistema** (`UserRole`). El rol de sistema se sugiere a partir del puesto al otorgar acceso.

---

## 🧪 Pruebas

```bash
npm run test -w backend       # unitarias
npm run test:e2e -w backend   # e2e (requiere BD y seed)
```

- **Unitarias**: cubren las reglas de negocio puras (validación de turnos, cálculo de asistencia, promedios de evaluación, etc.).
- **e2e**:
  - Levantan la app completa contra la base de datos de `.env`.
  - Se ejecutan en serie y limpian los datos que crean.
  - Se recomienda usar una **rama de Neon** dedicada a pruebas.

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
| [`docs/`](docs/) | Plan del módulo, revisión del esquema y bitácora de cada fase (`03`–`08`) |
| `/api/docs` | Swagger de la API, con el backend en ejecución |

---

<div align="center">
<sub>Hecho con ☕ para la operación diaria de una central camionera.</sub>
</div>
