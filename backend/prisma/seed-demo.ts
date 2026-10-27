// Datos de demostración para revisar la interfaz con información realista.
//   npm run seed:demo -w backend            → carga (reemplaza los demo anteriores)
//   npm run seed:demo -w backend -- --clean → solo borra
//   npm run seed:demo -w backend -- --fleet → solo agrega la flota demo (no toca al personal)
// Todo lo demo se identifica por el correo @demo.camionera.mx de los empleados.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AttendanceSource,
  AttendanceStatus,
  BusType,
  CertificationType,
  EvaluationStatus,
  PaymentFrequency,
  PaymentType,
  PayrollStatus,
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_DOMAIN = '@demo.camionera.mx';
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
  const staff = await prisma.staff.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);
  await prisma.payrollPeriod.deleteMany({ where: { name: { startsWith: 'DEMO · ' } } });
  await prisma.bus.deleteMany({ where: { plates: { startsWith: 'DEM' } } }); // asientos, documentos y lecturas en cascada
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
  ];
  for (const p of places) {
    const city = await prisma.city.upsert({
      where: { name_state: { name: p.city, state: p.state } },
      update: {},
      create: { name: p.city, state: p.state },
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
}

async function main() {
  if (process.argv.includes('--payroll')) return loadPayroll();
  if (process.argv.includes('--fleet')) return loadFleet();
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
