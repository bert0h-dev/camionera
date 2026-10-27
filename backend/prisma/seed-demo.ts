// Datos de demostración para revisar la interfaz con información realista.
//   npm run seed:demo -w backend            → carga (reemplaza los demo anteriores)
//   npm run seed:demo -w backend -- --clean → solo borra
// Todo lo demo se identifica por el correo @demo.camionera.mx de los empleados.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AttendanceSource,
  AttendanceStatus,
  CertificationType,
  EvaluationStatus,
  LicenseType,
  PrismaClient,
  ShiftType,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../src/generated/prisma/client.js';
import { addDays, dateKey, today, weekStart, zonedDateTime } from '../src/common/dates.js';

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

async function main() {
  await clean();
  if (!process.argv.includes('--clean')) await load();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
