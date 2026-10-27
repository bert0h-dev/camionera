import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, ShiftType, StaffRole, UserRole } from '../src/generated/prisma/client.js';

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
