// Datos de demostración para revisar la interfaz con información realista.
//   npm run seed:demo -w backend            → carga (reemplaza los demo anteriores)
//   npm run seed:demo -w backend -- --clean → solo borra
//   npm run seed:demo -w backend -- --fleet → solo agrega la flota y el mantenimiento demo (no toca al personal)
//   npm run seed:demo -w backend -- --routes → solo agrega las rutas demo (clave DEM-…)
//   npm run seed:demo -w backend -- --platforms → solo agrega andenes 1–6 a las terminales demo y los pone en horarios y recorridos
//   npm run seed:demo -w backend -- --sales → ventas demo de 60 días atrás y 14 adelante (reemplaza las anteriores)
//   npm run seed:demo -w backend -- --sales --clean → solo borra las ventas demo
//   DEMO_PASSWORD en .env (opcional) crea el usuario mecánico demo
// Todo lo demo se identifica por el correo @demo.camionera.mx de los empleados.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import {
  AttendanceSource,
  AttendanceStatus,
  BusType,
  CertificationType,
  EvaluationStatus,
  PaymentFrequency,
  PaymentType,
  PayrollStatus,
  Prisma,
  LicenseType,
  PrismaClient,
  ShiftType,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../src/generated/prisma/client.js';
import { addDays, dateKey, today, weekStart, zonedDateTime } from '../src/common/dates.js';
import { computePayroll, totals } from '../src/payroll/payroll-rules.js';
import { defaultLayout, seatCount } from '../src/fleet/layout-rules.js';
import { seatsFromLayout } from '../src/fleet/bus-rules.js';
import { fuelTotal, measureLoads } from '../src/fleet/fuel-rules.js';
import { cleanSales, loadSales } from './seed-sales.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_DOMAIN = '@demo.camionera.mx';
const DEMO_TERMINALS = ['GDL', 'CDMXN', 'LEO', 'QRO', 'HMO', 'TIJ', 'MZT'];
const DEMO_PLATFORMS = ['1', '2', '3', '4', '5', '6'];
const MINUTE = 60_000;

const PEOPLE: [string, string, string, StaffRole, StaffStatus?][] = [
  ['Juan', 'Pérez', 'López', StaffRole.driver],
  ['Raúl', 'Méndez', 'Cruz', StaffRole.driver],
  ['Ana', 'Torres', 'Vega', StaffRole.driver, StaffStatus.vacation],
  ['Luis', 'Hernández', 'Gil', StaffRole.driver],
  ['Carlos', 'Ramírez', 'Ortiz', StaffRole.driver],
  ['Jorge', 'Flores', 'Navarro', StaffRole.driver],
  ['Miguel', 'Castillo', 'Reyes', StaffRole.driver],
  ['Ricardo', 'Morales', 'Silva', StaffRole.driver],
  ['Fernando', 'Aguilar', 'Rojas', StaffRole.driver],
  ['Sergio', 'Vargas', 'Medina', StaffRole.driver, StaffStatus.sick_leave],
  ['Pedro', 'Jiménez', 'Campos', StaffRole.collector],
  ['Daniel', 'Ruiz', 'Herrera', StaffRole.collector],
  ['María', 'Sánchez', 'Ruiz', StaffRole.vendor],
  ['Laura', 'Gómez', 'Díaz', StaffRole.vendor],
  ['Patricia', 'Romero', 'Luna', StaffRole.vendor],
  ['Alberto', 'Núñez', 'Paredes', StaffRole.mechanic],
  ['Héctor', 'Delgado', 'Salas', StaffRole.mechanic],
  ['Gabriela', 'Ríos', 'Fuentes', StaffRole.supervisor],
  ['Claudia', 'Mendoza', 'Cortés', StaffRole.hr],
  ['Rosa', 'Estrada', 'Pineda', StaffRole.admin_staff],
];

const SHIFTS = {
  [ShiftType.morning]: ['06:00', '14:00'],
  [ShiftType.afternoon]: ['14:00', '22:00'],
  [ShiftType.night]: ['22:00', '06:00'],
} as const;
const ROTATION = [ShiftType.morning, ShiftType.afternoon, ShiftType.night] as const;

/** Pseudoaleatorio determinista para que la demo sea reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

async function clean() {
  await cleanSales(prisma); // boletos y compras referencian recorridos y usuarios demo
  const staff = await prisma.staff.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);
  await prisma.payrollPeriod.deleteMany({ where: { name: { startsWith: 'DEMO · ' } } });
  await prisma.maintenanceOrder.deleteMany({ where: { bus: { plates: { startsWith: 'DEM' } } } });
  await prisma.busIncident.deleteMany({ where: { bus: { plates: { startsWith: 'DEM' } } } });
  await prisma.fuelLoad.deleteMany({ where: { bus: { plates: { startsWith: 'DEM' } } } });
  // Recorridos de las rutas demo y los que usan unidades o personal demo (historial en cascada)
  await prisma.trip.deleteMany({
    where: {
      OR: [
        { route: { code: { startsWith: 'DEM-' } } },
        { bus: { plates: { startsWith: 'DEM' } } },
        { driverId: { in: ids } },
        { collectorId: { in: ids } },
      ],
    },
  });
  await prisma.route.deleteMany({ where: { code: { startsWith: 'DEM-' } } }); // paradas y horarios en cascada
  // Andenes demo que ya nadie usa (los que tengan horarios o recorridos del usuario se quedan)
  await prisma.platform.deleteMany({
    where: {
      terminal: { code: { in: DEMO_TERMINALS } },
      code: { in: DEMO_PLATFORMS },
      schedules: { none: {} },
      trips: { none: {} },
    },
  });
  await prisma.season.deleteMany({ where: { description: { startsWith: 'Demo · ' } } });
  await prisma.bus.deleteMany({ where: { plates: { startsWith: 'DEM' } } }); // asientos, documentos y lecturas en cascada
  await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  await prisma.staff.deleteMany({ where: { id: { in: ids } } }); // documentos, turnos, asistencias y evaluaciones en cascada
  await prisma.auditLog.deleteMany({ where: { recordId: { in: ids } } });
  console.log(`Demo eliminada: ${ids.length} empleados`);
}

async function load() {
  const admin = await prisma.user.findFirst({ where: { role: UserRole.admin }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('Primero corre el seed base (npx prisma db seed)');
  const templates = await prisma.shiftTemplate.findMany();
  const templateOf = (t: ShiftType) => templates.find((x) => x.shiftType === t)?.id ?? null;
  const criteria = await prisma.evaluationCriterion.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });

  const day0 = today();
  const now = new Date();
  const from = addDays(weekStart(day0), -7); // semana pasada
  const to = addDays(weekStart(day0), 13); // fin de la semana siguiente
  const random = rng(42);

  for (const [i, [firstName, lastName, secondLastName, role, status]] of PEOPLE.entries()) {
    const [{ seq }] = await prisma.$queryRaw<{ seq: bigint }[]>`SELECT nextval('staff_employee_number_seq') AS seq`;
    const staff = await prisma.staff.create({
      data: {
        employeeNumber: `EMP-${String(seq).padStart(6, '0')}`,
        firstName,
        lastName,
        secondLastName,
        birthDate: new Date(Date.UTC(1975 + (i % 20), i % 12, 1 + (i % 27))),
        email: `${firstName}.${lastName}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + DEMO_DOMAIN,
        phone: `55${String(10000000 + i * 734521).slice(0, 8)}`,
        role,
        status: status ?? StaffStatus.active,
        hireDate: new Date(Date.UTC(2018 + (i % 7), (i * 5) % 12, 1)),
        emergencyContact: '[Contacto de emergencia]',
        emergencyPhone: '5500000000',
      },
    });

    // Documentos de conductores: uno vencido y dos por vencer para ver las alertas
    if (role === StaffRole.driver) {
      const expiryOffset = i === 1 ? -10 : i === 4 ? 12 : i === 7 ? 25 : 200 + i * 20;
      await prisma.staffLicense.create({
        data: {
          staffId: staff.id,
          licenseType: LicenseType.A,
          licenseNumber: `DEMO-LIC-${seq}`,
          issuer: 'SICT',
          issueDate: addDays(day0, expiryOffset - 365 * 2),
          expiryDate: addDays(day0, expiryOffset),
        },
      });
      await prisma.staffCertification.create({
        data: {
          staffId: staff.id,
          type: CertificationType.medical_exam,
          name: 'Examen psicofísico integral',
          issuer: 'Medicina Preventiva del Transporte',
          issueDate: addDays(day0, -100),
          expiryDate: addDays(day0, i === 2 ? 12 : 265),
        },
      });
    }

    if (status === StaffStatus.vacation || status === StaffStatus.sick_leave) continue;
    if (role === StaffRole.hr || role === StaffRole.admin_staff) continue; // sin turnos rotativos

    // Turnos: tipo fijo por persona, un día de descanso a la semana
    const shiftType = ROTATION[i % ROTATION.length];
    const restWeekday = i % 7; // 0 = lunes
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const date = dateKey(d);
      const isRestDay = (d.getUTCDay() + 6) % 7 === restWeekday;
      const [start, end] = SHIFTS[shiftType];
      const startAt = isRestDay ? null : zonedDateTime(date, start);
      const endAt = isRestDay ? null : zonedDateTime(end < start ? dateKey(addDays(d, 1)) : date, end);
      const schedule = await prisma.staffSchedule.create({
        data: {
          staffId: staff.id,
          scheduleDate: d,
          startAt,
          endAt,
          shiftType: isRestDay ? null : shiftType,
          isRestDay,
          templateId: isRestDay ? null : templateOf(shiftType),
          createdById: admin.id,
        },
      });
      if (!startAt || !endAt || startAt > now) continue;

      // Asistencia: mayoría a tiempo, algunos retardos, pocas faltas; hoy dejamos un par sin entrada
      const r = random();
      const isToday = d.getTime() === day0.getTime();
      if (isToday && r < 0.15) continue;
      let attendanceStatus: AttendanceStatus = AttendanceStatus.present;
      let checkInAt: Date | null = new Date(startAt.getTime() + Math.round((random() * 18 - 10) * MINUTE));
      if (r > 0.97) {
        attendanceStatus = AttendanceStatus.excused;
        checkInAt = null;
      } else if (r > 0.93) {
        attendanceStatus = AttendanceStatus.absent;
        checkInAt = null;
      } else if (r > 0.82) {
        attendanceStatus = AttendanceStatus.late;
        checkInAt = new Date(startAt.getTime() + Math.round((15 + random() * 35) * MINUTE));
      }
      const extra = random() > 0.8 ? Math.round(30 + random() * 60) : 0;
      const plannedOut = new Date(endAt.getTime() + extra * MINUTE);
      const checkOutAt = checkInAt && plannedOut <= now ? plannedOut : null;
      const lateMinutes =
        attendanceStatus === AttendanceStatus.late && checkInAt
          ? Math.round((checkInAt.getTime() - startAt.getTime()) / MINUTE)
          : 0;
      await prisma.staffAttendance.create({
        data: {
          staffId: staff.id,
          attendanceDate: d,
          scheduleId: schedule.id,
          checkInAt,
          checkOutAt,
          status: attendanceStatus,
          lateMinutes,
          workedMinutes: checkInAt && checkOutAt ? Math.round((checkOutAt.getTime() - checkInAt.getTime()) / MINUTE) : 0,
          overtimeMinutes: checkOutAt && extra >= 30 ? extra : 0,
          source: random() > 0.5 ? AttendanceSource.self : AttendanceSource.manual,
          recordedById: admin.id,
          notes: attendanceStatus === AttendanceStatus.excused ? 'Permiso con goce de sueldo' : null,
        },
      });
    }

    // Evaluaciones: algunas finalizadas y un borrador
    if (i % 4 === 0 || i === 13) {
      const applicable = criteria.filter((c) => c.appliesTo.length === 0 || c.appliesTo.includes(role));
      const draft = i === 13;
      const scores = applicable.map((c) => ({
        criterionId: c.id,
        criterionName: c.name,
        weight: c.weight,
        score: draft ? null : 3 + Math.floor(random() * 3),
      }));
      const totalWeight = scores.reduce((t, s) => t + s.weight, 0);
      const overall = draft ? null : scores.reduce((t, s) => t + s.weight * s.score!, 0) / totalWeight;
      await prisma.staffEvaluation.create({
        data: {
          staffId: staff.id,
          evaluatorId: admin.id,
          periodStart: new Date(Date.UTC(day0.getUTCFullYear(), 0, 1)),
          periodEnd: new Date(Date.UTC(day0.getUTCFullYear(), 5, 30)),
          status: draft ? EvaluationStatus.draft : i % 8 === 0 ? EvaluationStatus.acknowledged : EvaluationStatus.finalized,
          overallScore: overall === null ? null : Math.round(overall * 100) / 100,
          strengths: draft ? null : 'Responsable y puntual con los horarios de salida.',
          improvements: draft ? null : 'Mejorar el registro de incidencias en bitácora.',
          finalizedAt: draft ? null : addDays(day0, -20),
          acknowledgedAt: i % 8 === 0 ? addDays(day0, -15) : null,
          scores: { create: scores },
        },
      });
    }
  }
  console.log(`Demo cargada: ${PEOPLE.length} empleados con turnos, asistencias, documentos y evaluaciones`);
}

// Salario diario de ejemplo por puesto
const DAILY_SALARY: Record<StaffRole, number> = {
  [StaffRole.driver]: 650,
  [StaffRole.collector]: 380,
  [StaffRole.vendor]: 360,
  [StaffRole.mechanic]: 520,
  [StaffRole.supervisor]: 700,
  [StaffRole.hr]: 600,
  [StaffRole.admin_staff]: 420,
};
const DEMO_PERIOD_PREFIX = 'DEMO · ';

/**
 * Salarios para los empleados demo y una prenómina cerrada de la semana pasada.
 * No toca los demás datos demo; se puede correr sobre una demo ya cargada.
 */
async function loadPayroll() {
  const admin = await prisma.user.findFirst({ where: { role: UserRole.admin }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('Primero corre el seed base (npx prisma db seed)');
  const staff = await prisma.staff.findMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  if (staff.length === 0) throw new Error('No hay datos demo: corre primero npm run seed:demo');

  await prisma.payrollPeriod.deleteMany({ where: { name: { startsWith: DEMO_PERIOD_PREFIX } } });
  await prisma.staffCompensation.deleteMany({ where: { staffId: { in: staff.map((s) => s.id) } } });

  const day0 = today();
  const periodStart = addDays(weekStart(day0), -7);
  const periodEnd = addDays(periodStart, 6);
  // Dos empleados quedan sin salario para que se vea el aviso
  const paid = staff.filter((_, i) => i % 9 !== 8);
  for (const s of paid) {
    await prisma.staffCompensation.create({
      data: {
        staffId: s.id,
        paymentType: PaymentType.daily,
        baseSalary: DAILY_SALARY[s.role],
        paymentFrequency: PaymentFrequency.weekly,
        effectiveFrom: s.hireDate,
        createdById: admin.id,
      },
    });
  }

  const period = await prisma.payrollPeriod.create({
    data: {
      name: `${DEMO_PERIOD_PREFIX}Semana ${dateKey(periodStart)}`,
      frequency: PaymentFrequency.weekly,
      periodStart,
      periodEnd,
      status: PayrollStatus.closed,
      generatedAt: new Date(),
      closedAt: new Date(),
      createdById: admin.id,
    },
  });
  for (const s of paid.filter((x) => x.status !== StaffStatus.inactive)) {
    const records = await prisma.staffAttendance.findMany({
      where: { staffId: s.id, attendanceDate: { gte: periodStart, lte: periodEnd } },
    });
    const result = computePayroll({
      paymentType: 'daily',
      baseSalary: DAILY_SALARY[s.role],
      periodStart,
      periodEnd,
      records: records.map((r) => ({ date: r.attendanceDate, status: r.status, overtimeMinutes: r.overtimeMinutes })),
      latePolicy: { enabled: false, latesPerAbsence: 3 },
    });
    await prisma.payrollEntry.create({
      data: {
        periodId: period.id,
        staffId: s.id,
        paymentType: PaymentType.daily,
        baseSalary: DAILY_SALARY[s.role],
        ...result,
        ...totals(result, []),
      },
    });
  }
  console.log(`Nómina demo: ${paid.length} salarios y el periodo "${period.name}" cerrado`);
}

const DEMO_SPEC = 'Modelo de demostración';

/** Flota demo: ciudades, terminales y modelos. Se puede correr sola (--fleet) sin tocar al personal demo. */
async function loadFleet() {
  const diesel = await prisma.fuelType.findUnique({ where: { name: 'Diésel' } });
  if (!diesel) throw new Error('Primero corre el seed base (npx prisma db seed)');

  const places = [
    { city: 'Guadalajara', state: 'Jalisco', code: 'GDL', name: 'Nueva Central Camionera de Guadalajara', lat: 20.6283, lng: -103.2853 },
    { city: 'Ciudad de México', state: 'Ciudad de México', code: 'CDMXN', name: 'Central de Autobuses del Norte', lat: 19.4794, lng: -99.1405 },
    { city: 'León', state: 'Guanajuato', code: 'LEO', name: 'Central de Autobuses de León', lat: 21.1035, lng: -101.6602 },
    { city: 'Querétaro', state: 'Querétaro', code: 'QRO', name: 'Terminal de Autobuses de Querétaro', lat: 20.5768, lng: -100.3739 },
    // Zonas distintas al centro para probar horarios entre estados
    { city: 'Hermosillo', state: 'Sonora', code: 'HMO', name: 'Central de Autobuses de Hermosillo', lat: 29.0729, lng: -110.9559, tz: 'America/Hermosillo' },
    { city: 'Tijuana', state: 'Baja California', code: 'TIJ', name: 'Central Camionera de Tijuana', lat: 32.4997, lng: -116.9667, tz: 'America/Tijuana' },
    { city: 'Mazatlán', state: 'Sinaloa', code: 'MZT', name: 'Central de Autobuses de Mazatlán', lat: 23.2366, lng: -106.4205, tz: 'America/Mazatlan' },
  ];
  for (const p of places) {
    const timezone = p.tz ?? 'America/Mexico_City';
    const city = await prisma.city.upsert({
      where: { name_state: { name: p.city, state: p.state } },
      update: { timezone },
      create: { name: p.city, state: p.state, timezone },
    });
    await prisma.terminal.upsert({
      where: { code: p.code },
      update: { latitude: p.lat, longitude: p.lng },
      create: { code: p.code, name: p.name, cityId: city.id, latitude: p.lat, longitude: p.lng },
    });
  }

  const models = [
    { brand: 'Volvo', model: '9700', busType: BusType.executive, rows: 11, floors: 1 as const, eff: 3.2, tank: 450 },
    { brand: 'Irizar', model: 'i8', busType: BusType.luxury, rows: 9, floors: 1 as const, eff: 3.0, tank: 500 },
    { brand: 'Mercedes-Benz', model: 'Multego', busType: BusType.standard, rows: 12, floors: 1 as const, eff: 3.5, tank: 400 },
    { brand: 'Volvo', model: '9800 DD', busType: BusType.double_decker, rows: 10, floors: 2 as const, eff: 2.6, tank: 600 },
  ];
  for (const m of models) {
    const layout = defaultLayout(m.rows, m.floors);
    // Primeras filas preferentes y una accesible junto a la puerta
    for (const cell of layout.floors[0].cells)
      if (cell.type === 'seat')
        cell.category = cell.r === 1 && cell.c === 0 ? 'accessible' : cell.r <= 2 ? 'preferred' : 'normal';
    await prisma.busModel.upsert({
      where: { brand_model: { brand: m.brand, model: m.model } },
      update: {},
      create: {
        brand: m.brand,
        model: m.model,
        busType: m.busType,
        fuelTypeId: diesel.id,
        tankCapacity: m.tank,
        expectedEfficiency: m.eff,
        specifications: DEMO_SPEC,
        features: m.busType === BusType.standard ? ['A/C', 'Baño'] : ['A/C', 'Baño', 'WiFi', 'Pantallas', 'USB'],
        preventiveKm: 15000,
        preventiveDays: 90,
        layout: layout as unknown as object,
        seatCount: seatCount(layout),
      },
    });
  }
  console.log(`Flota demo: ${places.length} terminales y ${models.length} modelos`);
  await loadPlatforms();

  // Unidades demo: placas DEM… para identificarlas; solo se crean las que no existen
  const allModels = await prisma.busModel.findMany({ where: { specifications: DEMO_SPEC }, orderBy: { brand: 'asc' } });
  const allTerminals = await prisma.terminal.findMany({ where: { code: { in: places.map((p) => p.code) } } });
  const day0 = today();
  let created = 0;
  for (let i = 0; i < 12; i++) {
    const economicNumber = String(1001 + i);
    if (await prisma.bus.findUnique({ where: { economicNumber } })) continue;
    const model = allModels[i % allModels.length];
    const odometerKm = 80_000 + i * 23_500;
    const bus = await prisma.bus.create({
      data: {
        economicNumber,
        plates: `DEM${String(i + 1).padStart(4, '0')}`,
        vin: `3DEMO${String(i + 1).padStart(12, '0')}`,
        year: 2018 + (i % 7),
        busModelId: model.id,
        terminalId: allTerminals[i % allTerminals.length].id,
        odometerKm,
        // Algunas en taller o fuera de servicio para ver la variedad en pantalla
        ...(i === 3 && { status: 'maintenance', statusReason: 'Cambio de balatas' }),
        ...(i === 8 && { status: 'out_of_service', statusReason: 'Motor en reparación mayor' }),
        ...(i % 2 === 0 && i !== 8 && { firstServiceAt: addDays(day0, -400) }),
        seats: { create: seatsFromLayout(model.layout as unknown as Parameters<typeof seatsFromLayout>[0]) },
        readings: { create: { km: odometerKm } },
      },
    });
    // Seguro: uno vencido, dos por vencer, el resto vigente; la tarjeta no vence
    const insuranceExpiry = i === 5 ? addDays(day0, -3) : i === 2 || i === 7 ? addDays(day0, 12 + i) : addDays(day0, 200 + i * 5);
    await prisma.busDocument.createMany({
      data: [
        {
          busId: bus.id,
          type: 'insurance',
          folio: `POL-${economicNumber}`,
          issuer: 'Qualitas',
          issueDate: addDays(insuranceExpiry, -365),
          expiryDate: insuranceExpiry,
        },
        { busId: bus.id, type: 'circulation_card', folio: `TC-${economicNumber}`, issueDate: addDays(day0, -500) },
        {
          busId: bus.id,
          type: 'sict_permit',
          folio: `SICT-${economicNumber}`,
          issuer: 'SICT',
          issueDate: addDays(day0, -300),
          expiryDate: addDays(day0, i === 10 ? 20 : 400),
        },
      ],
    });
    created++;
  }
  console.log(`Unidades demo: ${created} nuevas`);
  await loadMaintenance();
  await loadIncidents();
  await loadFuel();
  await loadRoutes();
}

/**
 * Andenes 1–6 en cada terminal demo; los horarios demo sin andén se reparten entre ellos por hora
 * de salida (para que no se encimen) y los recorridos de esos horarios sin andén toman el suyo.
 * Es idempotente: no cambia andenes ya puestos.
 */
async function loadPlatforms() {
  const terminals = await prisma.terminal.findMany({ where: { code: { in: DEMO_TERMINALS } } });
  for (const t of terminals)
    for (const code of DEMO_PLATFORMS)
      await prisma.platform.upsert({
        where: { terminalId_code: { terminalId: t.id, code } },
        update: {},
        create: { terminalId: t.id, code },
      });
  console.log(`Andenes demo: ${terminals.length * DEMO_PLATFORMS.length} en ${terminals.length} terminales`);

  const schedules = await prisma.routeSchedule.findMany({
    where: { route: { code: { startsWith: 'DEM-' } } },
    include: { route: { select: { originTerminalId: true } } },
    orderBy: { departureTime: 'asc' },
  });
  const platforms = await prisma.platform.findMany({
    where: { terminalId: { in: terminals.map((t) => t.id) }, code: { in: DEMO_PLATFORMS } },
    orderBy: { code: 'asc' },
  });
  const seen = new Map<string, number>();
  let assigned = 0;
  for (const s of schedules) {
    const terminalId = s.route.originTerminalId;
    const n = seen.get(terminalId) ?? 0;
    seen.set(terminalId, n + 1);
    if (s.platformId) continue;
    const own = platforms.filter((p) => p.terminalId === terminalId);
    if (!own.length) continue;
    await prisma.routeSchedule.update({ where: { id: s.id }, data: { platformId: own[n % own.length].id } });
    assigned++;
  }
  // Los recorridos ya generados toman el andén de su horario
  let trips = 0;
  for (const s of await prisma.routeSchedule.findMany({
    where: { route: { code: { startsWith: 'DEM-' } }, platformId: { not: null } },
  })) {
    const r = await prisma.trip.updateMany({
      where: { routeScheduleId: s.id, platformId: null },
      data: { platformId: s.platformId },
    });
    trips += r.count;
  }
  console.log(`Andenes en horarios demo: ${assigned} nuevos · recorridos con andén: ${trips}`);
}

/** Rutas demo (clave DEM-…) entre las terminales demo; incluye cruces de zona horaria. */
async function loadRoutes() {
  const routes = [
    { code: 'DEM-GDL-CDMX', name: 'Guadalajara – Ciudad de México', from: 'GDL', to: 'CDMXN', price: 820, min: 420, km: 625 },
    { code: 'DEM-CDMX-GDL', name: 'Ciudad de México – Guadalajara', from: 'CDMXN', to: 'GDL', price: 820, min: 420, km: 625 },
    { code: 'DEM-GDL-LEO', name: 'Guadalajara – León', from: 'GDL', to: 'LEO', price: 390, min: 210, km: 220 },
    { code: 'DEM-LEO-QRO', name: 'León – Querétaro', from: 'LEO', to: 'QRO', price: 340, min: 150, km: 190 },
    { code: 'DEM-QRO-CDMX', name: 'Querétaro – Ciudad de México', from: 'QRO', to: 'CDMXN', price: 310, min: 180, km: 215 },
    { code: 'DEM-GDL-MZT', name: 'Guadalajara – Mazatlán', from: 'GDL', to: 'MZT', price: 760, min: 480, km: 490 },
    { code: 'DEM-HMO-TIJ', name: 'Hermosillo – Tijuana', from: 'HMO', to: 'TIJ', price: 1150, min: 600, km: 690 },
    { code: 'DEM-MZT-HMO', name: 'Mazatlán – Hermosillo', from: 'MZT', to: 'HMO', price: 980, min: 690, km: 750, inactive: true },
  ];
  const terminals = new Map(
    (await prisma.terminal.findMany({ where: { code: { in: routes.flatMap((r) => [r.from, r.to]) } } })).map((t) => [
      t.code,
      t.id,
    ]),
  );
  for (const r of routes) {
    const data = {
      name: r.name,
      originTerminalId: terminals.get(r.from)!,
      destinationTerminalId: terminals.get(r.to)!,
      basePrice: r.price,
      estimatedDurationMinutes: r.min,
      distanceKm: r.km,
      isActive: !r.inactive,
    };
    await prisma.route.upsert({ where: { code: r.code }, update: data, create: { code: r.code, ...data } });
  }
  console.log(`Rutas demo: ${routes.length}`);

  // Horarios demo: Guadalajara – Mazatlán queda sin horarios para que se vea el aviso en Inicio
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const start = addDays(today(), -30);
  const plans: Record<string, { times: string[]; days: number[]; until?: Date }[]> = {
    'DEM-GDL-CDMX': [{ times: ['06:00', '08:30', '13:00', '22:00'], days: ALL }],
    'DEM-CDMX-GDL': [{ times: ['07:00', '14:30', '23:00'], days: ALL }],
    'DEM-GDL-LEO': [
      { times: ['07:15', '15:15'], days: WEEKDAYS },
      { times: ['09:00'], days: [0, 6] },
    ],
    // Corrida de temporada que vence pronto
    'DEM-LEO-QRO': [{ times: ['08:00', '18:00'], days: ALL, until: addDays(today(), 5) }],
    'DEM-QRO-CDMX': [{ times: ['05:30', '12:00', '19:30'], days: WEEKDAYS }],
    'DEM-HMO-TIJ': [{ times: ['09:00', '21:00'], days: ALL }],
  };
  let schedules = 0;
  for (const [code, list] of Object.entries(plans)) {
    const route = await prisma.route.findUnique({ where: { code }, include: { _count: { select: { schedules: true } } } });
    if (!route || route._count.schedules) continue;
    for (const p of list)
      for (const t of p.times) {
        await prisma.routeSchedule.create({
          data: {
            routeId: route.id,
            departureTime: new Date(`1970-01-01T${t}:00Z`),
            daysOfWeek: p.days,
            validFrom: start,
            validUntil: p.until ?? null,
          },
        });
        schedules++;
      }
  }
  console.log(`Horarios demo: ${schedules} nuevos (desde ${dateKey(start)})`);
  await loadPlatforms();

  // Paradas demo: la ruta GDL ⇄ CDMX pasa por León y Querétaro; la distancia sale de los tramos
  const itineraries: Record<string, { stops: [string, number, number, number][]; finalKm: number }> = {
    // [terminal, km acumulados, minutos desde el origen, precio desde el origen]
    'DEM-GDL-CDMX': { stops: [['LEO', 220, 200, 390], ['QRO', 410, 330, 620]], finalKm: 215 },
    'DEM-CDMX-GDL': { stops: [['QRO', 215, 150, 310], ['LEO', 405, 280, 560]], finalKm: 220 },
  };
  for (const [code, it] of Object.entries(itineraries)) {
    const route = await prisma.route.findUnique({ where: { code }, include: { _count: { select: { stops: true } } } });
    if (!route || route._count.stops) continue;
    const ids = new Map(
      (await prisma.terminal.findMany({ where: { code: { in: it.stops.map((s) => s[0]) } } })).map((t) => [t.code, t.id]),
    );
    await prisma.routeStop.createMany({
      data: it.stops.map(([t, km, min, price], i) => ({
        routeId: route.id,
        terminalId: ids.get(t)!,
        stopOrder: i + 1,
        kmFromOrigin: km,
        durationFromOriginMinutes: min,
        priceFromOrigin: price,
      })),
    });
    await prisma.route.update({
      where: { id: route.id },
      data: { distanceKm: it.stops[it.stops.length - 1][1] + it.finalKm },
    });
  }
  console.log('Paradas demo: GDL ⇄ CDMX por León y Querétaro');

  // Temporadas demo (globales); se reconocen por la descripción "Demo · …"
  const seasons = [
    { name: 'Baja de otoño', seasonType: 'low' as const, from: '2026-10-01', until: '2026-11-30', pct: -10 },
    { name: 'Navidad y Año Nuevo', seasonType: 'holiday' as const, from: '2026-12-15', until: '2027-01-06', pct: 25 },
    { name: 'Semana Santa 2027', seasonType: 'holiday' as const, from: '2027-03-21', until: '2027-04-04', pct: 20 },
    { name: 'Verano 2027', seasonType: 'high' as const, from: '2027-07-05', until: '2027-08-22', pct: 10 },
  ];
  let newSeasons = 0;
  for (const s of seasons) {
    if (await prisma.season.findFirst({ where: { name: s.name } })) continue;
    await prisma.season.create({
      data: {
        name: s.name,
        seasonType: s.seasonType,
        validFrom: new Date(`${s.from}T00:00:00Z`),
        validUntil: new Date(`${s.until}T00:00:00Z`),
        priceModifierPercent: s.pct,
        description: 'Demo · temporada de ejemplo',
      },
    });
    newSeasons++;
  }
  console.log(`Temporadas demo: ${newSeasons} nuevas`);
}

/**
 * Incidencias demo: una crítica que saca de servicio a una unidad, una en revisión ligada
 * a la orden de aire acondicionado y dos cerradas (una de ellas, accidente con siniestro).
 */
async function loadIncidents() {
  if (await prisma.busIncident.count({ where: { bus: { plates: { startsWith: 'DEM' } } } })) return;
  const categories = Object.fromEntries((await prisma.incidentCategory.findMany()).map((c) => [c.name, c.id]));
  if (!categories['Mecánica']) return console.log('Incidencias demo: corre primero el seed base (categorías)');

  // Reporta un conductor demo si existe; si no, el primer coordinador o admin
  const reporter =
    (await prisma.user.findFirst({ where: { role: UserRole.driver, email: { endsWith: DEMO_DOMAIN } } })) ??
    (await prisma.user.findFirstOrThrow({ where: { role: { in: [UserRole.coordinator, UserRole.admin] } } }));
  const reviewer = await prisma.user.findFirst({ where: { role: { in: [UserRole.coordinator, UserRole.admin] } } });
  const buses = await prisma.bus.findMany({ where: { plates: { startsWith: 'DEM' } }, orderBy: { economicNumber: 'asc' } });
  const available = buses.filter((b) => b.status === 'available');
  const day0 = today();
  const at = (days: number, hour: number) => new Date(addDays(day0, days).getTime() + (hour + 6) * 3_600_000);
  let count = 0;

  // Crítica sin revisar: la unidad queda fuera de servicio
  const critical = available.at(-1);
  if (critical) {
    const inc = await prisma.busIncident.create({
      data: {
        busId: critical.id,
        categoryId: categories['Mecánica'],
        severity: 'critical',
        description: 'Fuga de aceite en motor, se enciende el testigo de presión',
        location: 'Terminal, andén 3',
        occurredAt: at(0, 7),
        odometerKm: critical.odometerKm,
        reportedBy: reporter.id,
        tookBusOut: true,
      },
    });
    await prisma.bus.update({
      where: { id: critical.id },
      data: {
        status: 'out_of_service',
        statusReason: `INC-${String(inc.folio).padStart(6, '0')}: ${inc.description}`,
        statusChangedAt: new Date(),
      },
    });
    count++;
  }

  // En revisión con su orden correctiva (la de aire acondicionado)
  const acOrder = await prisma.maintenanceOrder.findFirst({
    where: { bus: { plates: { startsWith: 'DEM' } }, type: 'corrective', status: 'scheduled' },
  });
  if (acOrder) {
    const inc = await prisma.busIncident.create({
      data: {
        busId: acOrder.busId,
        categoryId: categories['Eléctrica'],
        severity: 'medium',
        status: 'in_review',
        description: 'El aire acondicionado no enfría en la parte trasera',
        occurredAt: at(-2, 15),
        reportedBy: reporter.id,
        reviewedBy: reviewer?.id,
        reviewedAt: at(-1, 9),
      },
    });
    await prisma.maintenanceOrder.update({ where: { id: acOrder.id }, data: { incidentId: inc.id } });
    count++;
  }

  // Cerradas: una resuelta sin orden y un accidente leve con siniestro
  if (available[0]) {
    await prisma.busIncident.create({
      data: {
        busId: available[0].id,
        categoryId: categories['Interiores y limpieza'],
        severity: 'low',
        status: 'resolved',
        description: 'Asiento 14 con la palanca de reclinado rota',
        occurredAt: at(-9, 18),
        reportedBy: reporter.id,
        reviewedBy: reviewer?.id,
        reviewedAt: at(-8, 10),
        closedAt: at(-8, 12),
        resolution: 'Se cambió la palanca en patio',
      },
    });
    count++;
  }
  if (available[1]) {
    await prisma.busIncident.create({
      data: {
        busId: available[1].id,
        categoryId: categories['Accidente'],
        severity: 'high',
        status: 'resolved',
        description: 'Alcance leve en caseta; espejo lateral derecho roto',
        location: 'Caseta de cobro Mazatlán',
        occurredAt: at(-15, 11),
        reportedBy: reporter.id,
        claimNumber: 'SIN-2026-08815',
        insurer: 'Qualitas · ajustador Ramírez',
        thirdParties: true,
        injuries: false,
        reviewedBy: reviewer?.id,
        reviewedAt: at(-15, 13),
        closedAt: at(-12, 17),
        resolution: 'Espejo cambiado; el seguro del tercero cubrió el daño',
      },
    });
    count++;
  }
  console.log(`Incidencias demo: ${count}`);
}

/**
 * Mantenimiento demo: órdenes terminadas, una en proceso (unidad 1004) y algunas programadas.
 * El mecánico demo solo se crea si DEMO_PASSWORD está en .env; si no, las órdenes quedan sin asignar.
 */
async function loadMaintenance() {
  if (await prisma.maintenanceOrder.count({ where: { bus: { plates: { startsWith: 'DEM' } } } })) return;

  let mechanicId: string | null = null;
  if (process.env.DEMO_PASSWORD) {
    const mechanic = await prisma.user.upsert({
      where: { email: `mecanico${DEMO_DOMAIN}` },
      update: {},
      create: {
        email: `mecanico${DEMO_DOMAIN}`,
        fullName: 'Mecánico Demo',
        role: UserRole.mechanic,
        passwordHash: await argon2.hash(process.env.DEMO_PASSWORD),
      },
    });
    mechanicId = mechanic.id;
  }

  const buses = await prisma.bus.findMany({ where: { plates: { startsWith: 'DEM' } }, orderBy: { economicNumber: 'asc' } });
  const templates = await prisma.maintenanceTaskTemplate.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const day0 = today();
  const taskRows = (done: boolean) =>
    templates.map((t) => ({ description: t.description, sortOrder: t.sortOrder, isDone: done, doneAt: done ? new Date() : null }));
  let count = 0;

  for (const [i, bus] of buses.entries()) {
    // Preventivo terminado hace un tiempo: reinicia el conteo del próximo servicio
    if (i % 3 !== 2 && bus.status !== 'out_of_service') {
      const daysAgo = 20 + i * 7;
      const km = bus.odometerKm - (3000 + i * 1100);
      const completedAt = addDays(day0, -daysAgo);
      await prisma.maintenanceOrder.create({
        data: {
          busId: bus.id,
          type: 'preventive',
          status: 'completed',
          description: 'Servicio preventivo de 15,000 km',
          scheduledDate: addDays(completedAt, -1),
          mechanicId,
          startedAt: addDays(completedAt, -1),
          startKm: km,
          completedAt,
          endKm: km,
          workPerformed: 'Servicio completo según tareas base',
          laborCost: 1800 + i * 50,
          partsCost: 3500 + i * 120,
          tasks: { create: taskRows(true) },
        },
      });
      await prisma.bus.update({ where: { id: bus.id }, data: { lastServiceAt: completedAt, lastServiceKm: km } });
      count++;
    }
  }

  // La 1004 ya está en mantenimiento: le corresponde una orden en proceso
  const inShop = buses.find((b) => b.status === 'maintenance');
  if (inShop) {
    await prisma.maintenanceOrder.create({
      data: {
        busId: inShop.id,
        type: 'corrective',
        status: 'in_progress',
        priority: 'urgent',
        description: 'Cambio de balatas delanteras',
        scheduledDate: addDays(day0, -1),
        mechanicId,
        startedAt: addDays(day0, -1),
        startKm: inShop.odometerKm,
        tasks: {
          create: [
            { description: 'Desmontar ruedas delanteras', sortOrder: 10, isDone: true, doneAt: new Date() },
            { description: 'Cambiar balatas y revisar discos', sortOrder: 20 },
            { description: 'Prueba de frenado', sortOrder: 30 },
          ],
        },
      },
    });
    await prisma.bus.update({ where: { id: inShop.id }, data: { statusReason: 'Cambio de balatas delanteras' } });
    count++;
  }

  // Programadas para los próximos días
  for (const [n, bus] of buses.filter((b, i) => i % 3 === 2 && b.status === 'available').slice(0, 3).entries()) {
    await prisma.maintenanceOrder.create({
      data: {
        busId: bus.id,
        type: n === 2 ? 'corrective' : 'preventive',
        description: n === 2 ? 'Revisar aire acondicionado, no enfría' : 'Servicio preventivo de 15,000 km',
        scheduledDate: addDays(day0, 2 + n * 3),
        mechanicId: n === 0 ? mechanicId : null,
        tasks: { create: n === 2 ? [] : taskRows(false) },
      },
    });
    count++;
  }
  console.log(`Mantenimiento demo: ${count} órdenes${mechanicId ? '' : ' (sin mecánico: define DEMO_PASSWORD para crearlo)'}`);
}

/**
 * Combustible demo: ~3 meses de cargas por unidad que terminan en su odómetro actual,
 * con una parcial de vez en cuando. La 1002 cae en rendimiento en sus últimos tanques
 * para que salga la alerta, y un conductor demo deja dos cargas por confirmar.
 */
async function loadFuel() {
  if (await prisma.fuelLoad.count({ where: { bus: { plates: { startsWith: 'DEM' } } } })) return;
  const recorder = await prisma.user.findFirst({ where: { role: { in: [UserRole.coordinator, UserRole.admin] } } });
  if (!recorder) return;
  const driver = await prisma.user.findFirst({ where: { role: UserRole.driver, email: { endsWith: DEMO_DOMAIN } } });
  const buses = await prisma.bus.findMany({
    where: { plates: { startsWith: 'DEM' } },
    include: { busModel: true },
    orderBy: { economicNumber: 'asc' },
  });
  const stations = ['Pemex Periférico', 'Pemex Autopista km 120', 'G500 Central', 'Oxxo Gas Libramiento'];
  const day0 = today();
  const at = (days: number, hour: number) => new Date(addDays(day0, days).getTime() + (hour + 6) * 3_600_000);
  // Precio del diésel por día: sube poco a poco con algo de ruido
  const price = (days: number) => Math.round((24.2 + (90 + days) * 0.012 + ((days * 7) % 5) * 0.04) * 1000) / 1000;
  let count = 0;

  for (const [i, bus] of buses.entries()) {
    const expected = Number(bus.busModel.expectedEfficiency ?? 3);
    const tank = Number(bus.busModel.tankCapacity ?? 400);
    const trips = 14;
    // Tramos de ~1,000–1,300 km cada 6 días, hacia atrás desde el odómetro actual
    const legs = Array.from({ length: trips }, (_, k) => 1000 + ((i * 37 + k * 53) % 300));
    let km = bus.odometerKm - legs.reduce((a, b) => a + b, 0);
    const rows: Prisma.FuelLoadCreateManyInput[] = [];
    for (let k = 0; k < trips; k++) {
      km += legs[k];
      const days = -6 * (trips - k);
      const drop = bus.economicNumber === '1002' && k >= trips - 2 ? 0.78 : 1;
      const eff = expected * drop * (0.96 + ((i + k) % 5) * 0.02);
      const liters = Math.min(tank, Math.round((legs[k] / eff) * 100) / 100);
      // Cada cuarto tramo se parte: una parcial a medio camino y el lleno al final
      if (k % 4 === 2 && k < trips - 2) {
        const part = Math.round(liters * 0.4 * 100) / 100;
        rows.push({
          busId: bus.id,
          fuelTypeId: bus.busModel.fuelTypeId,
          loadedAt: at(days - 3, 13),
          quantity: part,
          unitPrice: price(days - 3),
          total: fuelTotal(part, price(days - 3)),
          odometerKm: km - Math.round(legs[k] / 2),
          isFullTank: false,
          station: stations[(i + k + 1) % stations.length],
          recordedBy: recorder.id,
          reviewedBy: recorder.id,
          reviewedAt: at(days - 3, 14),
        });
        rows.push({
          busId: bus.id,
          fuelTypeId: bus.busModel.fuelTypeId,
          loadedAt: at(days, 8),
          quantity: liters - part,
          unitPrice: price(days),
          total: fuelTotal(liters - part, price(days)),
          odometerKm: km,
          station: stations[(i + k) % stations.length],
          ticket: `T-${bus.economicNumber}-${k}`,
          recordedBy: recorder.id,
          reviewedBy: recorder.id,
          reviewedAt: at(days, 9),
        });
        continue;
      }
      rows.push({
        busId: bus.id,
        fuelTypeId: bus.busModel.fuelTypeId,
        loadedAt: at(days, 8),
        quantity: liters,
        unitPrice: price(days),
        total: fuelTotal(liters, price(days)),
        odometerKm: km,
        station: stations[(i + k) % stations.length],
        ticket: `T-${bus.economicNumber}-${k}`,
        recordedBy: recorder.id,
        reviewedBy: recorder.id,
        reviewedAt: at(days, 9),
      });
    }
    const measures = measureLoads(
      rows.map((r, n) => ({ id: String(n), odometerKm: r.odometerKm, quantity: Number(r.quantity), isFullTank: r.isFullTank ?? true })),
    );
    await prisma.fuelLoad.createMany({ data: rows.map((r, n) => ({ ...r, ...measures.get(String(n)) })) });
    count += rows.length;

    // Dos cargas del conductor esperando confirmación
    if (driver && i < 2) {
      const liters = Math.round((900 / expected) * 100) / 100;
      await prisma.fuelLoad.create({
        data: {
          busId: bus.id,
          fuelTypeId: bus.busModel.fuelTypeId,
          loadedAt: at(-i, 7),
          quantity: liters,
          unitPrice: price(-i),
          total: fuelTotal(liters, price(-i)),
          odometerKm: bus.odometerKm + 900,
          station: stations[i],
          ticket: `T-${bus.economicNumber}-C`,
          status: 'pending',
          recordedBy: driver.id,
        },
      });
      count++;
    }
  }
  console.log(`Combustible demo: ${count} cargas`);
}

async function main() {
  if (process.argv.includes('--payroll')) return loadPayroll();
  if (process.argv.includes('--fleet')) return loadFleet();
  if (process.argv.includes('--routes')) return loadRoutes();
  if (process.argv.includes('--platforms')) return loadPlatforms();
  if (process.argv.includes('--sales')) {
    await cleanSales(prisma);
    if (!process.argv.includes('--clean')) await loadSales(prisma);
    return;
  }
  await clean();
  if (!process.argv.includes('--clean')) {
    await load();
    await loadPayroll();
    await loadFleet();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
