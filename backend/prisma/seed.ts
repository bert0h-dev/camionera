import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, SeasonType, ShiftType, StaffRole, UserRole } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env');
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName: process.env.SEED_ADMIN_NAME ?? 'Administrador',
      role: UserRole.admin,
      passwordHash: await argon2.hash(password),
    },
  });
  console.log(`Admin listo: ${admin.email}`);

  // Plantillas de turno base (no se sobrescriben si ya existen)
  const templates = [
    { name: 'Matutino', shiftType: ShiftType.morning, startTime: '06:00', endTime: '14:00' },
    { name: 'Vespertino', shiftType: ShiftType.afternoon, startTime: '14:00', endTime: '22:00' },
    { name: 'Nocturno', shiftType: ShiftType.night, startTime: '22:00', endTime: '06:00' },
  ];
  for (const t of templates) {
    await prisma.shiftTemplate.upsert({ where: { name: t.name }, update: {}, create: t });
  }
  console.log(`Plantillas de turno: ${templates.map((t) => t.name).join(', ')}`);

  // Criterios de evaluación base (vacío en appliesTo = todos los puestos)
  const criteria = [
    { name: 'Puntualidad y asistencia', weight: 2, appliesTo: [] },
    { name: 'Trato al pasajero', weight: 2, appliesTo: [] },
    { name: 'Trabajo en equipo', weight: 1, appliesTo: [] },
    { name: 'Cumplimiento de procedimientos', weight: 2, appliesTo: [] },
    { name: 'Manejo seguro', weight: 3, appliesTo: [StaffRole.driver] },
    { name: 'Cuidado de la unidad', weight: 2, appliesTo: [StaffRole.driver] },
  ];
  for (const [i, c] of criteria.entries()) {
    await prisma.evaluationCriterion.upsert({
      where: { name: c.name },
      update: {},
      create: { ...c, sortOrder: (i + 1) * 10 },
    });
  }
  console.log(`Criterios de evaluación: ${criteria.length}`);

  // Catálogo de combustibles (se configura en cada modelo de bus)
  const fuels = [
    { name: 'Diésel', unit: 'L' },
    { name: 'Gasolina', unit: 'L' },
    { name: 'Gas LP', unit: 'L' },
    { name: 'Gas natural', unit: 'm³' },
  ];
  for (const f of fuels) {
    await prisma.fuelType.upsert({ where: { name: f.name }, update: {}, create: f });
  }
  console.log(`Combustibles: ${fuels.length}`);

  // Tareas base del servicio preventivo (se copian a cada orden preventiva nueva)
  const tasks = [
    'Cambio de aceite de motor y filtro',
    'Cambio de filtros de aire y combustible',
    'Revisión de frenos y balatas',
    'Revisión de suspensión y dirección',
    'Revisión de llantas, presión y rotación',
    'Revisión de niveles (refrigerante, frenos, dirección)',
    'Revisión de luces y sistema eléctrico',
    'Revisión de aire acondicionado',
    'Engrasado general',
    'Prueba de manejo',
  ];
  for (const [i, description] of tasks.entries()) {
    await prisma.maintenanceTaskTemplate.upsert({ where: { description }, update: {}, create: { description, sortOrder: (i + 1) * 10 } });
  }
  console.log(`Tareas de preventivo: ${tasks.length}`);

  // Categorías de incidencia (editables desde Flota → Incidencias)
  const categories: [string, boolean][] = [
    ['Mecánica', false],
    ['Eléctrica', false],
    ['Llantas', false],
    ['Carrocería', false],
    ['Interiores y limpieza', false],
    ['Accidente', true],
    ['Otro', false],
  ];
  for (const [i, [name, isAccident]] of categories.entries()) {
    await prisma.incidentCategory.upsert({ where: { name }, update: {}, create: { name, isAccident, sortOrder: (i + 1) * 10 } });
  }
  console.log(`Categorías de incidencia: ${categories.length}`);

  // Tipos de pasajero (editables desde Configuración › Parámetros › Boletos)
  const passengerTypes = [
    { code: 'ADULTO', name: 'Adulto', discountPercent: 0, isDefault: true },
    { code: 'NINO', name: 'Niño (3 a 11 años)', discountPercent: 50, requiresId: false },
    { code: 'INAPAM', name: 'Adulto mayor (INAPAM)', discountPercent: 50, maxPerTrip: 4, requiresId: true },
    {
      code: 'ESTUDIANTE',
      name: 'Estudiante o maestro',
      discountPercent: 50,
      requiresId: true,
      seasonTypes: [SeasonType.high, SeasonType.holiday],
    },
  ];
  for (const [i, t] of passengerTypes.entries()) {
    await prisma.passengerType.upsert({ where: { code: t.code }, update: {}, create: { ...t, sortOrder: (i + 1) * 10 } });
  }
  console.log(`Tipos de pasajero: ${passengerTypes.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
