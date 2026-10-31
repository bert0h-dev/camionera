// Ventas demo para los reportes (Módulo 7): recorridos de los últimos 60 días y los próximos 14 en
// las rutas demo, con boletos, pagos, cajas con corte, abordajes, no presentados, cancelaciones,
// cambios, reembolsos, promociones y clientes. Todo se marca para poder borrarlo:
//   compras y recorridos creados aquí → notas 'DEMO-VENTAS'; clientes → correo @demo.camionera.mx;
//   promociones → clave DEMO…; usuarios de los vendedores demo → correo @demo.camionera.mx.
// Los precios salen de las mismas reglas de la taquilla (temporada, tipo de pasajero, promoción e IVA).
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  CashMovementType,
  CashSessionStatus,
  DiscountType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  SaleChannel,
  StaffRole,
  StaffStatus,
  TicketEventType,
  TicketStatus,
  TripStatus,
  UserRole,
} from '../src/generated/prisma/client.js';
import { addDays, dateKey, today } from '../src/common/dates.js';
import { cashTotals, commission } from '../src/cash/cash-rules.js';
import { wallTime } from '../src/routes/route-rules.js';
import { applySeason, seasonOn } from '../src/routes/season-rules.js';
import { timeKey } from '../src/routes/schedule-rules.js';
import { cancellationQuote } from '../src/tickets/cancellation-rules.js';
import { fromCents, toCents } from '../src/tickets/money.js';
import { orderTotals, priceTickets, promotionDiscount, type PromotionRule } from '../src/tickets/pricing-rules.js';
import { qrToken } from '../src/tickets/qr-token.js';
import { plannedTrips } from '../src/trips/trip-rules.js';
import { fuelTotal, measureLoads } from '../src/fleet/fuel-rules.js';

export const SALES_NOTE = 'DEMO-VENTAS';
const DEMO_DOMAIN = '@demo.camionera.mx';
const MIN = 60_000;
const HOUR = 3_600_000;
const DAYS_BACK = 60;
const DAYS_AHEAD = 14;

/** Pseudoaleatorio determinista (misma semilla = mismos datos). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const FIRST = ['Ana', 'Luis', 'Sofía', 'Diego', 'Valeria', 'Jorge', 'Camila', 'Andrés', 'Fernanda', 'Ricardo', 'Paola', 'Emilio', 'Daniela', 'Héctor', 'Lucía', 'Mario', 'Regina', 'Iván', 'Mariana', 'Óscar'];
const LAST = ['García', 'Martínez', 'López', 'Hernández', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz'];

/** Borra solo las ventas demo (lo demás demo queda). */
export async function cleanSales(prisma: PrismaClient) {
  const orders = await prisma.order.findMany({
    where: { OR: [{ notes: { startsWith: SALES_NOTE } }, { seller: { email: { endsWith: DEMO_DOMAIN } } }] },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  const users = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } });
  await prisma.cashSession.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } }); // movimientos en cascada
  await prisma.refund.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.ticket.updateMany({ where: { orderId: { in: ids } }, data: { replacedById: null } });
  await prisma.ticket.deleteMany({ where: { orderId: { in: ids } } }); // eventos en cascada
  await prisma.order.deleteMany({ where: { id: { in: ids } } }); // promociones de la compra en cascada
  await prisma.promotion.deleteMany({ where: { code: { startsWith: 'DEMO' } } });
  await prisma.customer.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  await prisma.fuelLoad.deleteMany({ where: { ticket: { startsWith: SALES_NOTE } } });
  const trips = await prisma.trip.deleteMany({ where: { notes: SALES_NOTE } });
  console.log(`Ventas demo eliminadas: ${ids.length} compras, ${trips.count} recorridos`);
}

export async function loadSales(prisma: PrismaClient) {
  const random = rng(2026);
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  const chance = (p: number) => random() < p;
  const now = new Date();
  const day0 = today();
  const start = dateKey(addDays(day0, -DAYS_BACK));
  const end = dateKey(addDays(day0, DAYS_AHEAD - 1));
  const qrSecret = process.env.TICKET_QR_SECRET;
  if (!qrSecret) throw new Error('Falta TICKET_QR_SECRET en el .env');

  // ---------- Catálogos ----------
  const admin = await prisma.user.findFirst({ where: { role: UserRole.admin }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('Primero corre el seed base');
  const terminal = { include: { city: true } } as const;
  const routes = await prisma.route.findMany({
    where: { code: { startsWith: 'DEM-' }, isActive: true },
    include: {
      originTerminal: terminal,
      destinationTerminal: terminal,
      stops: { orderBy: { stopOrder: 'asc' }, include: { terminal: terminal } },
      schedules: { where: { isActive: true } },
    },
  });
  if (!routes.length) throw new Error('No hay rutas demo; corre primero npm run seed:demo -w backend -- --routes');
  const buses = await prisma.bus.findMany({
    where: { plates: { startsWith: 'DEM' }, status: { in: ['available', 'in_service'] } },
    include: { seats: { where: { isBlocked: false }, select: { number: true } }, busModel: true },
    orderBy: { economicNumber: 'asc' },
  });
  const staff = await prisma.staff.findMany({
    where: { email: { endsWith: DEMO_DOMAIN }, status: StaffStatus.active },
    orderBy: { employeeNumber: 'asc' },
  });
  const drivers = staff.filter((s) => s.role === StaffRole.driver);
  const collectors = staff.filter((s) => s.role === StaffRole.collector);
  if (!buses.length || !drivers.length) throw new Error('Faltan unidades o conductores demo');

  // Usuarios de los vendedores demo (sin contraseña conocida: solo para atribuir las ventas)
  const sellers: { id: string; fullName: string }[] = [];
  for (const v of staff.filter((s) => s.role === StaffRole.vendor)) {
    let user = v.userId ? await prisma.user.findUnique({ where: { id: v.userId } }) : null;
    if (!user) {
      user = await prisma.user.upsert({
        where: { email: v.email! },
        update: {},
        create: {
          email: v.email!,
          fullName: `${v.firstName} ${v.lastName}`,
          role: UserRole.vendor,
          passwordHash: await argon2.hash(randomUUID()),
        },
      });
      await prisma.staff.update({ where: { id: v.id }, data: { userId: user.id } });
    }
    sellers.push({ id: user.id, fullName: user.fullName });
  }
  if (!sellers.length) sellers.push({ id: admin.id, fullName: admin.fullName });

  const types = await prisma.passengerType.findMany({ where: { isActive: true } });
  const typeBy = (code: string) => types.find((t) => t.code === code) ?? types.find((t) => t.isDefault)!;
  const seasons = (await prisma.season.findMany({ where: { isActive: true } })).map((s) => ({
    ...s,
    validFrom: dateKey(s.validFrom),
    validUntil: dateKey(s.validUntil),
    priceModifierPercent: Number(s.priceModifierPercent),
  }));
  const setting = async (key: string, def: string) =>
    (await prisma.systemSetting.findUnique({ where: { settingKey: key } }))?.settingValue ?? def;
  const tax = {
    vatRate: Number(await setting('taxes.vat_rate', '16')),
    pricesIncludeVat: (await setting('taxes.prices_include_vat', 'true')) === 'true',
    onlinePercent: 0,
  };
  const policy = {
    cancellationHours: Number(await setting('tickets.cancellation_hours', '2')),
    refundPercent: Number(await setting('tickets.refund_percent', '80')),
  };
  const vendorPercent = Number(await setting('commissions.vendor_percent', '0'));

  // Promociones demo
  const promoRows = [
    { code: 'DEMO10', name: 'Demo · 10 % de descuento', discountType: DiscountType.percent, discountValue: 10, maxDiscount: 150, minPurchase: 0 },
    { code: 'DEMOFIN', name: 'Demo · $100 en compras de $1,000', discountType: DiscountType.amount, discountValue: 100, maxDiscount: null, minPurchase: 1000 },
  ];
  const promos: Awaited<ReturnType<typeof prisma.promotion.create>>[] = [];
  for (const p of promoRows)
    promos.push(
      await prisma.promotion.create({
        data: { ...p, validFrom: new Date(`${start}T00:00:00Z`), validUntil: new Date(`${end}T00:00:00Z`), createdById: admin.id },
      }),
    );
  const promoRule = (p: (typeof promos)[number]): PromotionRule => ({
    discountType: p.discountType,
    discountValue: Number(p.discountValue),
    maxDiscount: p.maxDiscount == null ? null : Number(p.maxDiscount),
    maxUses: null,
    usesCount: 0,
    minPurchase: Number(p.minPurchase),
    validFrom: start,
    validUntil: end,
    channels: [],
    isActive: true,
  });
  const promoUses = new Map<string, number>();

  // Clientes demo (varios repiten compra)
  const customers = Array.from({ length: 80 }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    return {
      id: randomUUID(),
      fullName: `${first} ${last} ${LAST[(i * 3 + 5) % LAST.length]}`,
      email: `${first}.${last}.${i}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + DEMO_DOMAIN,
      phone: `33${String(20000000 + i * 91357).slice(0, 8)}`,
    };
  });
  await prisma.customer.createMany({ data: customers });

  // ---------- Recorridos ----------
  const existing = await prisma.trip.findMany({
    where: { tripDate: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T00:00:00Z`) } },
    select: { id: true, routeScheduleId: true, tripDate: true, busId: true, driverId: true, collectorId: true, departureAt: true, arrivalAt: true, status: true },
  });
  const busy = new Map<string, [number, number][]>();
  const occupy = (id: string | null, a: Date, b: Date) => {
    if (!id) return;
    busy.set(id, [...(busy.get(id) ?? []), [a.getTime(), b.getTime()]]);
  };
  const free = (id: string, a: number, b: number, gap: number) =>
    !(busy.get(id) ?? []).some(([x, y]) => a < y + gap && x < b + gap);
  for (const t of existing)
    if (t.status !== TripStatus.cancelled) {
      occupy(t.busId, t.departureAt, t.arrivalAt);
      occupy(t.driverId, t.departureAt, t.arrivalAt);
      occupy(t.collectorId, t.departureAt, t.arrivalAt);
    }
  const existingKey = new Map(existing.map((t) => [`${t.routeScheduleId}|${dateKey(t.tripDate)}`, t]));

  interface Point { terminalId: string; city: string; tz: string; minutes: number; price: number }
  const pointsOf = (r: (typeof routes)[number]): Point[] => [
    { terminalId: r.originTerminal.id, city: r.originTerminal.city.name, tz: r.originTerminal.city.timezone, minutes: 0, price: 0 },
    ...r.stops.map((s) => ({ terminalId: s.terminal.id, city: s.terminal.city.name, tz: s.terminal.city.timezone, minutes: s.durationFromOriginMinutes, price: Number(s.priceFromOrigin) })),
    { terminalId: r.destinationTerminal.id, city: r.destinationTerminal.city.name, tz: r.destinationTerminal.city.timezone, minutes: r.estimatedDurationMinutes, price: Number(r.basePrice) },
  ];

  type TripPlan = {
    id: string;
    route: (typeof routes)[number];
    tripDate: string;
    departureAt: Date;
    arrivalAt: Date;
    status: TripStatus;
    busId: string | null;
    driverId: string | null;
    seats: string[];
    create: boolean;
  };
  const plans: TripPlan[] = [];
  // Odómetro de la historia demo: muy por debajo del actual para no mezclarse con las cargas demo del M3
  const odometer = new Map(buses.map((b) => [b.id, Math.max(0, b.odometerKm - 200000)]));
  const tripRows: Prisma.TripCreateManyInput[] = [];
  const logRows: Prisma.TripStatusLogCreateManyInput[] = [];
  const assignRows: { id: string; busId: string; driverId: string }[] = [];

  for (const r of routes) {
    // Para la historia se ignora el inicio de vigencia de los horarios (las rutas demo son recientes)
    const planned = plannedTrips(
      {
        id: r.id,
        code: r.code,
        durationMinutes: r.estimatedDurationMinutes,
        originTz: r.originTerminal.city.timezone,
        isActive: true,
        schedules: r.schedules.map((s) => ({
          id: s.id,
          departureTime: timeKey(s.departureTime),
          daysOfWeek: s.daysOfWeek,
          validFrom: start,
          validUntil: s.validUntil ? dateKey(s.validUntil) : null,
          isActive: true,
        })),
      },
      start,
      end,
    );
    for (const p of planned) {
      const prev = existingKey.get(`${p.routeScheduleId}|${p.tripDate}`);
      if (prev && (prev.status === TripStatus.cancelled || prev.departureAt < now)) continue;
      const id = prev?.id ?? randomUUID();
      plans.push({
        id,
        route: r,
        tripDate: p.tripDate,
        departureAt: p.departureAt,
        arrivalAt: p.arrivalAt,
        status: TripStatus.scheduled,
        busId: prev?.busId ?? null,
        driverId: prev?.driverId ?? null,
        seats: [],
        create: !prev,
      });
      if (!prev) tripRows.push({ id, routeId: r.id, routeScheduleId: p.routeScheduleId, tripDate: new Date(`${p.tripDate}T00:00:00Z`), departureAt: p.departureAt, arrivalAt: p.arrivalAt, durationMinutes: p.durationMinutes, tripNumber: p.tripNumber, notes: SALES_NOTE });
    }
  }
  plans.sort((a, b) => a.departureAt.getTime() - b.departureAt.getTime());

  // Asignación: unidad y conductor libres (30 y 60 min de descanso)
  let bi = 0;
  let di = 0;
  for (const p of plans) {
    const a = p.departureAt.getTime();
    const b = p.arrivalAt.getTime();
    if (!p.busId)
      for (let k = 0; k < buses.length; k++) {
        const bus = buses[(bi + k) % buses.length];
        if (free(bus.id, a, b, 30 * MIN)) {
          p.busId = bus.id;
          bi = (bi + k + 1) % buses.length;
          occupy(bus.id, p.departureAt, p.arrivalAt);
          break;
        }
      }
    if (!p.driverId)
      for (let k = 0; k < drivers.length; k++) {
        const d = drivers[(di + k) % drivers.length];
        if (free(d.id, a, b, 60 * MIN)) {
          p.driverId = d.id;
          di = (di + k + 1) % drivers.length;
          occupy(d.id, p.departureAt, p.arrivalAt);
          break;
        }
      }
    p.seats = buses.find((x) => x.id === p.busId)?.seats.map((s) => s.number) ?? [];
    if (p.arrivalAt < now) p.status = chance(0.03) ? TripStatus.cancelled : TripStatus.completed;
    else if (p.departureAt < now) p.status = TripStatus.in_transit;
    const row = tripRows.find((t) => t.id === p.id);
    const collector = chance(0.3) && collectors.length ? pick(collectors) : null;
    const collectorFree = collector && free(collector.id, a, b, 0) ? collector.id : null;
    if (collectorFree) occupy(collectorFree, p.departureAt, p.arrivalAt);
    if (row) {
      row.busId = p.status === TripStatus.cancelled ? null : p.busId;
      row.driverId = p.status === TripStatus.cancelled ? null : p.driverId;
      row.collectorId = p.status === TripStatus.cancelled ? null : collectorFree;
      row.status = p.status;
      if (p.status === TripStatus.completed || p.status === TripStatus.in_transit) {
        const delay = chance(0.8) ? Math.floor(random() * 6) : chance(0.75) ? 10 + Math.floor(random() * 30) : 60 + Math.floor(random() * 60);
        row.actualDepartureAt = new Date(a + delay * MIN);
        const km = Math.round(Number(p.route.distanceKm ?? 500));
        const startKm = odometer.get(p.busId!) ?? 0;
        row.startOdometerKm = startKm;
        if (p.status === TripStatus.completed) {
          row.actualArrivalAt = new Date(b + (delay + Math.floor(random() * 20) - 5) * MIN);
          row.endOdometerKm = startKm + km;
          odometer.set(p.busId!, startKm + km);
        }
      }
      if (p.status === TripStatus.cancelled) {
        row.cancelReason = pick(['Falla mecánica de la unidad', 'Bloqueo carretero', 'Baja demanda']);
        row.cancelledAt = new Date(a - 3 * HOUR);
        row.cancelledById = admin.id;
      }
      logRows.push({ tripId: p.id, toStatus: TripStatus.scheduled, changedAt: new Date(a - 15 * 24 * HOUR) });
      if (p.status !== TripStatus.scheduled)
        logRows.push({ tripId: p.id, fromStatus: TripStatus.scheduled, toStatus: p.status, reason: row.cancelReason ?? null, changedAt: row.cancelledAt ?? row.actualArrivalAt ?? row.actualDepartureAt ?? now, changedById: admin.id });
    } else if (p.busId && p.driverId) assignRows.push({ id: p.id, busId: p.busId, driverId: p.driverId });
  }
  for (let i = 0; i < tripRows.length; i += 200) await prisma.trip.createMany({ data: tripRows.slice(i, i + 200) });
  for (let i = 0; i < logRows.length; i += 500) await prisma.tripStatusLog.createMany({ data: logRows.slice(i, i + 500) });
  for (const a of assignRows)
    await prisma.trip.updateMany({ where: { id: a.id, busId: null }, data: { busId: a.busId, driverId: a.driverId } }).catch(() => undefined);
  console.log(`Recorridos demo: ${tripRows.length} creados, ${assignRows.length} futuros asignados`);

  // Cargas de combustible alineadas con los km de los recorridos terminados: un lleno cada ~900–1,300 km
  const fuelRows: Prisma.FuelLoadCreateManyInput[] = [];
  const dieselPrice = (at: Date) =>
    Math.round((24.6 + ((at.getTime() - new Date(`${start}T00:00:00Z`).getTime()) / (24 * HOUR)) * 0.01) * 1000) / 1000;
  for (const bus of buses) {
    const done = tripRows
      .filter((t) => t.busId === bus.id && t.status === TripStatus.completed && t.endOdometerKm != null)
      .sort((a, b) => (a.startOdometerKm ?? 0) - (b.startOdometerKm ?? 0));
    if (!done.length) continue;
    const expected = Number(bus.busModel.expectedEfficiency ?? 3);
    // Unidad 1002: rendimiento bajo en la última quincena (para el aviso de rendimiento)
    const low = bus.economicNumber === '1002';
    const rows: Prisma.FuelLoadCreateManyInput[] = [];
    // Lleno inicial antes del primer recorrido (base para medir)
    const first = done[0];
    rows.push({ busId: bus.id, fuelTypeId: bus.busModel.fuelTypeId, loadedAt: new Date((first.departureAt as Date).getTime() - HOUR), quantity: 300, unitPrice: dieselPrice(first.departureAt as Date), total: fuelTotal(300, dieselPrice(first.departureAt as Date)), odometerKm: first.startOdometerKm!, station: 'Pemex Central', ticket: `${SALES_NOTE}-${bus.economicNumber}-0`, recordedBy: admin.id, reviewedBy: admin.id, reviewedAt: first.departureAt as Date });
    let acc = 0;
    let threshold = 900 + random() * 400;
    for (const t of done) {
      acc += t.endOdometerKm! - t.startOdometerKm!;
      if (acc < threshold) continue;
      const at = (t.actualArrivalAt ?? t.arrivalAt) as Date;
      const recent = now.getTime() - at.getTime() < 15 * 24 * HOUR;
      const eff = expected * (low && recent ? 0.78 : 0.94 + random() * 0.1);
      const liters = Math.round((acc / eff) * 100) / 100;
      rows.push({ busId: bus.id, fuelTypeId: bus.busModel.fuelTypeId, loadedAt: new Date(at.getTime() + 20 * MIN), quantity: liters, unitPrice: dieselPrice(at), total: fuelTotal(liters, dieselPrice(at)), odometerKm: t.endOdometerKm!, station: pick(['Pemex Central', 'Pemex Autopista km 120', 'G500 Libramiento']), ticket: `${SALES_NOTE}-${bus.economicNumber}-${rows.length}`, recordedBy: admin.id, reviewedBy: admin.id, reviewedAt: new Date(at.getTime() + 60 * MIN) });
      acc = 0;
      threshold = 900 + random() * 400;
    }
    const measures = measureLoads(rows.map((r, n) => ({ id: String(n), odometerKm: r.odometerKm, quantity: Number(r.quantity), isFullTank: true })));
    fuelRows.push(...rows.map((r, n) => ({ ...r, ...measures.get(String(n)) })));
  }
  for (let i = 0; i < fuelRows.length; i += 500) await prisma.fuelLoad.createMany({ data: fuelRows.slice(i, i + 500) });
  console.log(`Cargas de combustible demo: ${fuelRows.length}`);

  // ---------- Ventas ----------
  const sessions = new Map<string, { id: string; userId: string; day: string; openedAt: Date; movements: { type: CashMovementType; method: PaymentMethod; amount: number }[] }>();
  const sessionFor = (userId: string, at: Date) => {
    const day = dateKey(new Date(at.getTime() - 6 * HOUR)); // turno de 06:00 a 06:00 aprox.
    const key = `${userId}|${day}`;
    let s = sessions.get(key);
    if (!s) {
      s = { id: randomUUID(), userId, day, openedAt: new Date(Math.min(at.getTime() - 30 * MIN, now.getTime())), movements: [] };
      sessions.set(key, s);
    }
    if (at < s.openedAt) s.openedAt = new Date(at.getTime() - 30 * MIN);
    return s;
  };

  const orders: Prisma.OrderCreateManyInput[] = [];
  const tickets: Prisma.TicketCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const refunds: Prisma.RefundCreateManyInput[] = [];
  const events: Prisma.TicketEventCreateManyInput[] = [];
  const orderPromos: Prisma.OrderPromotionCreateManyInput[] = [];
  const movements: Prisma.CashMovementCreateManyInput[] = [];
  const replaced: { oldId: string; newId: string }[] = [];
  let ticketSeq = 0;
  let orderSeq = 0;

  // Boletos que ya existen en esos recorridos (ventas reales): sus asientos no se reusan en el tramo
  const prior = await prisma.ticket.findMany({
    where: { tripId: { in: plans.filter((p) => !p.create).map((p) => p.id) }, status: { in: [TicketStatus.held, TicketStatus.confirmed, TicketStatus.checked_in] } },
    select: { tripId: true, seatNumber: true, boardIndex: true, alightIndex: true },
  });

  for (const p of plans) {
    if (!p.busId || !p.seats.length) continue;
    const points = pointsOf(p.route);
    const local = wallTime(p.departureAt, points[0].tz);
    const weekday = new Date(`${local.date}T12:00:00Z`).getUTCDay();
    const hour = Number(local.time.slice(0, 2));
    let load = 0.5 + ([0, 5, 6].includes(weekday) ? 0.2 : 0) + ((hour >= 6 && hour <= 9) || (hour >= 17 && hour <= 20) ? 0.1 : 0) + (random() - 0.5) * 0.5;
    const daysAhead = (p.departureAt.getTime() - now.getTime()) / (24 * HOUR);
    if (daysAhead > 0) load *= Math.max(0.05, 1 - daysAhead / 16);
    load = Math.min(0.97, Math.max(0.08, load));
    const season = seasonOn(seasons, p.tripDate);
    const occupied = new Map<string, [number, number][]>();
    for (const t of prior.filter((x) => x.tripId === p.id))
      occupied.set(t.seatNumber, [...(occupied.get(t.seatNumber) ?? []), [t.boardIndex, t.alightIndex]]);
    const seatFor = (bd: number, al: number) =>
      p.seats.find((s) => !(occupied.get(s) ?? []).some(([x, y]) => bd < y && x < al));
    const target = Math.round(p.seats.length * load * (points.length > 2 ? 1.25 : 1));
    let sold = 0;
    let inapam = 0;

    while (sold < target) {
      // Tramo: la mayoría de origen a destino; el resto entre paradas
      let bd = 0;
      let al = points.length - 1;
      if (points.length > 2 && chance(0.35)) {
        bd = Math.floor(random() * (points.length - 1));
        al = bd + 1 + Math.floor(random() * (points.length - 1 - bd));
      }
      const size = Math.min(target - sold, pick([1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 4]));
      const seats: string[] = [];
      for (let k = 0; k < size; k++) {
        const s = seatFor(bd, al);
        if (!s) break;
        seats.push(s);
        occupied.set(s, [...(occupied.get(s) ?? []), [bd, al]]);
      }
      if (!seats.length) break;
      sold += seats.length;

      const boardAt = new Date(p.departureAt.getTime() + points[bd].minutes * MIN);
      const alightAt = new Date(p.departureAt.getTime() + points[al].minutes * MIN);
      const latest = Math.min(boardAt.getTime() - 20 * MIN, now.getTime() - 5 * MIN);
      const earliest = Math.max(new Date(`${start}T14:00:00Z`).getTime(), boardAt.getTime() - 12 * 24 * HOUR);
      if (latest <= earliest) continue;
      const paidAt = new Date(earliest + Math.pow(random(), 0.6) * (latest - earliest));
      const seller = pick(sellers);
      const session = sessionFor(seller.id, paidAt);

      const basePrice = applySeason(Math.max(0, Math.round((points[al].price - points[bd].price) * 100) / 100), season?.priceModifierPercent ?? null);
      const paxTypes = seats.map(() => {
        const r = random();
        if (r < 0.07 && inapam < 4) {
          inapam++;
          return typeBy('INAPAM');
        }
        return r < 0.15 ? typeBy('NINO') : r < 0.2 ? typeBy('ESTUDIANTE') : typeBy('ADULTO');
      });
      const inputs = paxTypes.map((t) => ({
        basePrice,
        passengerType: { discountPercent: Number(t.discountPercent), seasonTypes: t.seasonTypes },
        seasonType: season?.seasonType ?? null,
      }));
      const amount = fromCents(priceTickets(inputs, tax, SaleChannel.counter).reduce((a, x) => a + toCents(x.basePrice) - toCents(x.passengerDiscount), 0));
      let promo: (typeof promos)[number] | null = null;
      if (chance(0.06)) promo = promos[0];
      else if (amount >= 1000 && chance(0.1)) promo = promos[1];
      const promoOff = promo ? promotionDiscount(promoRule(promo), amount) : 0;
      const prices = priceTickets(inputs, tax, SaleChannel.counter, promoOff);
      const totals = orderTotals(prices);

      const orderId = randomUUID();
      const customer = chance(0.6) ? pick(customers) : null;
      orders.push({
        id: orderId,
        orderNumber: `D${String(++orderSeq).padStart(7, '0')}`,
        channel: SaleChannel.counter,
        status: OrderStatus.paid,
        customerId: customer?.id ?? null,
        contactEmail: customer?.email ?? null,
        contactPhone: customer?.phone ?? null,
        sellerId: seller.id,
        cashSessionId: session.id,
        ...totals,
        paidAt,
        createdAt: new Date(paidAt.getTime() - 3 * MIN),
        notes: SALES_NOTE,
      });
      if (promo) {
        orderPromos.push({ orderId, promotionId: promo.id, discountApplied: promoOff });
        promoUses.set(promo.id, (promoUses.get(promo.id) ?? 0) + 1);
      }

      // Pagos: efectivo, tarjeta, transferencia o mixto
      const r = random();
      const parts: { method: PaymentMethod; amount: number }[] =
        r < 0.6
          ? [{ method: PaymentMethod.cash, amount: totals.total }]
          : r < 0.9
            ? [{ method: PaymentMethod.card, amount: totals.total }]
            : r < 0.97
              ? [{ method: PaymentMethod.transfer, amount: totals.total }]
              : [
                  { method: PaymentMethod.cash, amount: fromCents(Math.round(toCents(totals.total) / 2)) },
                  { method: PaymentMethod.card, amount: fromCents(toCents(totals.total) - Math.round(toCents(totals.total) / 2)) },
                ];
      for (const part of parts) {
        const id = randomUUID();
        payments.push({
          id,
          orderId,
          method: part.method,
          status: PaymentStatus.approved,
          amount: part.amount,
          received: part.method === PaymentMethod.cash ? Math.ceil(part.amount / 100) * 100 : null,
          reference: part.method === PaymentMethod.cash ? null : `DEMO-${Math.floor(random() * 900000 + 100000)}`,
          cashSessionId: session.id,
          recordedById: seller.id,
          paidAt,
        });
        movements.push({ sessionId: session.id, type: CashMovementType.sale, method: part.method, amount: part.amount, paymentId: id, createdById: seller.id, createdAt: paidAt });
        session.movements.push({ type: CashMovementType.sale, method: part.method, amount: part.amount });
      }

      // Boletos y lo que les pasó después
      for (const [k, seat] of seats.entries()) {
        const id = randomUUID();
        const name = `${pick(FIRST)} ${pick(LAST)} ${pick(LAST)}`;
        let status: TicketStatus = TicketStatus.confirmed;
        let checkedInAt: Date | null = null;
        let cancelledAt: Date | null = null;
        let cancelReason: string | null = null;
        let refundDue: number | null = null;
        const o = random();
        if (p.status === TripStatus.cancelled) {
          status = TicketStatus.cancelled;
          cancelledAt = new Date(p.departureAt.getTime() - 3 * HOUR);
          cancelReason = 'Recorrido cancelado';
          refundDue = prices[k].total;
        } else if (o < 0.06 && boardAt.getTime() - paidAt.getTime() > 4 * HOUR) {
          status = TicketStatus.cancelled;
          cancelledAt = new Date(paidAt.getTime() + random() * (boardAt.getTime() - paidAt.getTime() - 3 * HOUR));
          if (cancelledAt > now) cancelledAt = null;
          cancelReason = pick(['El pasajero ya no viaja', 'Cambio de planes', 'Enfermedad']);
        } else if (p.status === TripStatus.completed || (p.status === TripStatus.in_transit && bd === 0)) {
          status = o < 0.93 ? TicketStatus.checked_in : TicketStatus.no_show;
          if (status === TicketStatus.checked_in) checkedInAt = new Date(boardAt.getTime() - Math.floor(random() * 25) * MIN);
        }
        if (status === TicketStatus.cancelled && !cancelledAt) status = TicketStatus.confirmed;
        const ticketNumber = `D${String(++ticketSeq).padStart(7, '0')}`;
        tickets.push({
          id,
          ticketNumber,
          orderId,
          tripId: p.id,
          seatNumber: seat,
          boardIndex: bd,
          alightIndex: al,
          boardTerminalId: points[bd].terminalId,
          alightTerminalId: points[al].terminalId,
          boardAt,
          alightAt,
          passengerName: name,
          passengerTypeId: paxTypes[k].id,
          passengerDocument: paxTypes[k].requiresId ? `CRED-${Math.floor(random() * 90000 + 10000)}` : null,
          seasonPercent: season?.priceModifierPercent ?? null,
          ...prices[k],
          status,
          qrToken: qrToken(id, qrSecret),
          checkedInAt,
          checkedInById: checkedInAt ? admin.id : null,
          cancelledAt,
          cancelReason,
          refundDue,
          createdAt: paidAt,
        });
        events.push({ ticketId: id, type: TicketEventType.confirmed, userId: seller.id, createdAt: paidAt });
        if (checkedInAt) events.push({ ticketId: id, type: TicketEventType.checked_in, userId: admin.id, createdAt: checkedInAt });
        if (status === TicketStatus.no_show) events.push({ ticketId: id, type: TicketEventType.no_show, createdAt: p.departureAt });
        if (status === TicketStatus.cancelled && cancelledAt)
          events.push({ ticketId: id, type: TicketEventType.cancelled, userId: refundDue ? null : seller.id, createdAt: cancelledAt, detail: refundDue ? { tripCancelled: true } : { reason: cancelReason } });

        // Reembolso: cancelación del pasajero en plazo, o la mitad de los saldos de recorridos cancelados
        let refundAmount = 0;
        let refundAt: Date | null = null;
        if (status === TicketStatus.cancelled && cancelledAt && !refundDue) {
          refundAmount = cancellationQuote({ total: prices[k].total, serviceFee: 0, boardAt, now: cancelledAt }, policy).refund;
          refundAt = cancelledAt;
        } else if (refundDue && chance(0.5) && p.departureAt < now) {
          refundAmount = refundDue;
          refundAt = new Date(Math.min(p.departureAt.getTime() + 2 * HOUR, now.getTime() - MIN));
          tickets[tickets.length - 1].refundDue = null;
        }
        if (refundAmount > 0 && refundAt) {
          const by = pick(sellers);
          const rs = sessionFor(by.id, refundAt);
          const refundId = randomUUID();
          const method = parts[0].method;
          refunds.push({ id: refundId, orderId, ticketId: id, method, amount: refundAmount, reason: refundDue ? 'Recorrido cancelado' : cancelReason!, cashSessionId: rs.id, createdById: by.id, createdAt: refundAt });
          movements.push({ sessionId: rs.id, type: CashMovementType.refund, method, amount: refundAmount, refundId, createdById: by.id, createdAt: refundAt });
          rs.movements.push({ type: CashMovementType.refund, method, amount: refundAmount });
          events.push({ ticketId: id, type: TicketEventType.refunded, userId: by.id, createdAt: refundAt, detail: { amount: refundAmount, method } });
        }

        // Algunos cambios de asiento en el mismo recorrido (sin diferencia): el boleto viejo queda "changed"
        if (status === TicketStatus.confirmed && p.status === TripStatus.scheduled && chance(0.03)) {
          const other = seatFor(bd, al);
          if (other) {
            occupied.set(other, [...(occupied.get(other) ?? []), [bd, al]]);
            const newOrderId = randomUUID();
            const newId = randomUUID();
            const at = new Date(Math.min(paidAt.getTime() + 24 * HOUR, now.getTime() - MIN));
            orders.push({ id: newOrderId, orderNumber: `D${String(++orderSeq).padStart(7, '0')}`, channel: SaleChannel.counter, status: OrderStatus.paid, sellerId: seller.id, cashSessionId: sessionFor(seller.id, at).id, ...orderTotals([prices[k]]), paidAt: at, createdAt: at, notes: `${SALES_NOTE} · Cambio del boleto ${ticketNumber}` });
            tickets.push({ ...tickets[tickets.length - 1], id: newId, ticketNumber: `D${String(++ticketSeq).padStart(7, '0')}`, orderId: newOrderId, seatNumber: other, qrToken: qrToken(newId, qrSecret), createdAt: at });
            tickets.find((t) => t.id === id)!.status = TicketStatus.changed;
            tickets.find((t) => t.id === id)!.qrToken = null;
            replaced.push({ oldId: id, newId });
            events.push({ ticketId: id, type: TicketEventType.changed, userId: seller.id, createdAt: at, detail: { difference: 0, fee: 0 } });
            events.push({ ticketId: newId, type: TicketEventType.confirmed, userId: seller.id, createdAt: at });
          }
        }
      }
    }
  }

  // Cajas: abiertas por día y vendedor; las de días pasados con corte (algunas con diferencia)
  const sessionRows: Prisma.CashSessionCreateManyInput[] = [];
  for (const s of sessions.values()) {
    const opening = 500;
    const closedDay = s.day < dateKey(new Date(now.getTime() - 6 * HOUR));
    const totals = cashTotals(opening, s.movements);
    const diff = closedDay && chance(0.12) ? pick([-50, -20, -10, 10, 20]) : 0;
    const net = totals.netSales;
    sessionRows.push({
      id: s.id,
      userId: s.userId,
      status: closedDay ? CashSessionStatus.closed : CashSessionStatus.open,
      openingFloat: opening,
      openedAt: s.openedAt,
      ...(closedDay
        ? {
            closedAt: new Date(`${s.day}T23:00:00Z`).getTime() < now.getTime() ? new Date(`${s.day}T23:00:00Z`) : now,
            closedById: s.userId,
            expectedCash: totals.expectedCash,
            countedCash: fromCents(toCents(totals.expectedCash) + toCents(diff)),
            difference: diff,
            closingNotes: diff ? pick(['Error al dar cambio', 'Billete dudoso', 'Sobró cambio']) : null,
            commissionPercent: vendorPercent,
            commissionAmount: commission(net, vendorPercent),
            summary: { totals, orders: 0, tickets: 0, breakdown: null, tolerance: 0 } as unknown as Prisma.InputJsonValue,
          }
        : {}),
    });
  }
  // Solo una caja abierta por usuario: las de hoy se quedan abiertas solo si son la más reciente
  const latestOpen = new Map<string, string>();
  for (const s of sessionRows.filter((x) => x.status === CashSessionStatus.open).sort((a, b) => +new Date(a.openedAt as Date) - +new Date(b.openedAt as Date)))
    latestOpen.set(s.userId, s.id!);
  for (const s of sessionRows)
    if (s.status === CashSessionStatus.open && latestOpen.get(s.userId) !== s.id) {
      s.status = CashSessionStatus.closed;
      s.closedAt = now;
      s.closedById = s.userId;
    }
  // Si el vendedor ya tenía una caja abierta propia, las demo de hoy se cierran
  const alreadyOpen = new Set((await prisma.cashSession.findMany({ where: { status: CashSessionStatus.open }, select: { userId: true } })).map((s) => s.userId));
  for (const s of sessionRows)
    if (s.status === CashSessionStatus.open && alreadyOpen.has(s.userId)) {
      s.status = CashSessionStatus.closed;
      s.closedAt = now;
    }

  const batch = async <T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
  };
  await batch(sessionRows, 300, (d) => prisma.cashSession.createMany({ data: d }));
  await batch(orders, 500, (d) => prisma.order.createMany({ data: d }));
  await batch(tickets, 500, (d) => prisma.ticket.createMany({ data: d }));
  for (const r of replaced) await prisma.ticket.update({ where: { id: r.oldId }, data: { replacedById: r.newId } });
  await batch(payments, 500, (d) => prisma.payment.createMany({ data: d }));
  await batch(refunds, 500, (d) => prisma.refund.createMany({ data: d }));
  await batch(movements, 500, (d) => prisma.cashMovement.createMany({ data: d }));
  await batch(events, 1000, (d) => prisma.ticketEvent.createMany({ data: d }));
  await prisma.orderPromotion.createMany({ data: orderPromos });
  for (const [id, uses] of promoUses) await prisma.promotion.update({ where: { id }, data: { usesCount: uses } });

  console.log(
    `Ventas demo: ${orders.length} compras, ${tickets.length} boletos, ${payments.length} pagos, ${refunds.length} reembolsos, ${sessionRows.length} cajas, ${customers.length} clientes (${start} a ${end})`,
  );
}
