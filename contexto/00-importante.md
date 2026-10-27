## 1. VISIÓN GENERAL DEL PROYECTO

### 1.1 ¿Qué se va a construir?

Un sistema integral de gestión de autobuses que permita administrar toda la operación de una empresa de transporte terrestre de pasajeros, incluyendo:

- **Venta y gestión de boletos** (en línea y presencial)
- **Administración de flota** (unidades/autobuses)
- **Gestión de rutas y recorridos**
- **Control de personal** (conductores, cobradores, administrativos)
- **Reportes y análisis operacional**
- **Sistema de reservas y check-in**

---

## 2. ¿CÓMO DEBERÍA FUNCIONAR?

### 2.1 Flujos Principales de Usuario

#### 2.1.1 Flujo de Venta de Boletos (Cliente)

1. Cliente busca rutas disponibles (origen → destino → fecha)
2. Sistema muestra horarios y disponibilidad de asientos
3. Cliente selecciona horario y asientos específicos
4. Cliente ingresa datos de pasajeros
5. Cliente procesa pago (tarjeta, efectivo en taquilla, transferencia)
6. Sistema genera boleto con código QR único
7. Cliente recibe boleto por email/SMS o impreso

#### 2.1.2 Flujo de Gestión de Recorridos (Operador)

1. Sistema genera recorridos automáticamente según programación de rutas
2. Operador asigna unidad (autobús) al recorrido
3. Operador asigna personal (conductor + cobrador opcional)
4. Sistema valida disponibilidad de unidad y personal
5. Recorrido queda programado y visible para venta de boletos
6. Durante el viaje: sistema registra check-ins y estados

#### 2.1.3 Flujo de Administración de Flota

1. Administrador registra nueva unidad con todos sus datos
2. Sistema programa mantenimientos preventivos automáticos
3. Conductor reporta incidencias o requerimientos
4. Sistema actualiza estados (disponible, en mantenimiento, fuera de servicio)
5. Sistema genera alertas de mantenimientos próximos

#### 2.1.4 Flujo de Gestión de Personal

1. RRHH registra nuevo empleado con rol específico
2. Sistema crea credenciales de acceso según permisos
3. Supervisor programa turnos y asignaciones
4. Sistema valida horas máximas de conducción (regulaciones)
5. Sistema registra asistencias y genera nómina base

### 2.2 Reglas de Negocio Clave

- No se puede vender más boletos que asientos disponibles en la unidad
- Un conductor no puede tener más de un recorrido simultáneo
- Una unidad no puede estar en dos recorridos al mismo tiempo
- Los boletos pueden cancelarse hasta X horas antes de la salida
- Precios pueden variar por temporada, promociones o tipo de asiento
- Unidades en mantenimiento no pueden ser asignadas a recorridos
- Se requiere check-in 30 minutos antes de la salida

---

## 3. ¿QUÉ COMPONENTES LO FORMAN?

### 3.1 Módulos Funcionales

#### **MÓDULO 1: Gestión de Personal**

- CRUD de empleados
- Roles y permisos (conductor, cobrador, vendedor, admin)
- Horarios y turnos
- Registro de asistencias
- Certificaciones y licencias (conductores)
- Evaluaciones de desempeño
- Datos para nómina

#### **MÓDULO 2: Administración del Sistema**

- Gestión de usuarios del sistema
- Configuración general (empresa, impuestos, comisiones)
- Parámetros operacionales
- Respaldos y logs

#### **MÓDULO 3: Gestión de Flota**

- CRUD de unidades (autobuses)
- Configuración de asientos (layout)
- Calendario de servicios preventivos
- Estados y disponibilidad
- Documentación vehicular (seguros, permisos)

#### **MÓDULO 3.0: Gestión de Modelos de Bus**

- Gestión de modelos de bus
- Especificaciones técnicas (capacidad, tipo, modelo, año)

#### **MÓDULO 3.1: Gestión de Mantenimientos**

- Registro de mantenimientos preventivos y correctivos
- Alertas de vencimiento de mantenimientos
- Historial de mantenimientos

#### **MÓDULO 3.2: Gestión de Incidencias**

- Registro de incidencias por unidad

#### **MÓDULO 3.3: Gestión de Combustible**

- Registro de consumos y costos

#### **MÓDULO 4: Gestión de Rutas**

- CRUD de rutas (origen, destino, paradas intermedias)
- Catalogo de ciudades y terminales.
- Definición de precios por tramo
- Gestión de horarios y frecuencias
- Configuración de políticas de cancelación
- Temporadas y tarifas especiales

#### **MÓDULO 5: Gestión de Recorridos**

- Generación automática de recorridos
- Asignación de unidades
- Asignación de personal
- Estados del recorrido (programado, en curso, completado, cancelado)
- Tracking en tiempo real (opcional)
- Registro de incidencias

#### **MÓDULO 6: Gestión de Boletos**

- Búsqueda de rutas y horarios
- Selección de asientos (mapa visual)
- Carrito de compra
- Procesamiento de pagos
- Generación de boletos (QR)
- Cancelaciones y reembolsos
- Check-in de pasajeros

#### **MÓDULO 7: Reportes y Analytics**

- Ventas por período, ruta, origen/destino
- Ocupación promedio por ruta/horario
- Rendimiento de unidades (km recorridos, consumo)
- Productividad de personal
- Análisis de cancelaciones
- Dashboard ejecutivo
- Exportación de datos (Excel, PDF)

### 3.2 Modulos en el backend esperados

| Módulo         | Responsabilidad                   |
| -------------- | --------------------------------- |
| **auth**       | Login, registro, tokens, permisos |
| **users**      | Gestión de usuarios del sistema   |
| **customers**  | Gestión de clientes/pasajeros     |
| **cities**     | CRUD de ciudades                  |
| **routes**     | Rutas, horarios, paradas          |
| **buses**      | Flota, asientos, mantenimientos   |
| **staff**      | Personal, turnos, asistencias     |
| **trips**      | Recorridos, asignaciones          |
| **bookings**   | Reservas, check-in, cancelaciones |
| **payments**   | Pagos, reembolsos, integraciones  |
| **promotions** | Códigos de descuento              |
| **reports**    | Reportes y analytics              |
| **common**     | Utilidades compartidas            |
| **prisma**     | Cliente de base de datos          |
