// Reglas de la prenómina (LFT). Importes en centavos enteros para no acumular errores de flotante.

export type PaymentKind = 'daily' | 'monthly';
export type AttendanceKind =
  'present' | 'late' | 'half_day' | 'absent' | 'excused';

export interface PayrollAttendance {
  /** Día del turno, medianoche UTC (@db.Date) */
  date: Date;
  status: AttendanceKind;
  overtimeMinutes: number;
}

export interface LatePolicy {
  enabled: boolean;
  /** Retardos que equivalen a una falta */
  latesPerAbsence: number;
}

/** Días del mes comercial para convertir un sueldo mensual a diario. */
export const MONTH_DAYS = 30;
/** Jornada para obtener el valor de la hora. */
export const WORKDAY_HOURS = 8;
/** Horas extra semanales que se pagan dobles; las demás, triples (art. 67 y 68 LFT). */
export const DOUBLE_HOURS_PER_WEEK = 9;
/** Prima dominical (art. 71 LFT). */
export const SUNDAY_PREMIUM_RATE = 0.25;

const DAY_MS = 24 * 60 * 60 * 1000;

const toCents = (pesos: number) => Math.round(pesos * 100);
export const fromCents = (cents: number) => Math.round(cents) / 100;

/** Salario diario en centavos. */
export function dailySalaryCents(kind: PaymentKind, baseSalary: number) {
  return kind === 'monthly'
    ? Math.round(toCents(baseSalary) / MONTH_DAYS)
    : toCents(baseSalary);
}

/** Días naturales del periodo, ambos extremos incluidos. */
export const periodDays = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

/** Lunes (UTC) de la semana de `date`, como clave para agrupar extras. */
function weekKey(date: Date) {
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * DAY_MS).toISOString().slice(0, 10);
}

/** Reparte las horas extra de cada semana: primeras 9 dobles, el resto triples. */
export function splitOvertime(records: PayrollAttendance[]) {
  const byWeek = new Map<string, number>();
  for (const r of records) {
    if (r.overtimeMinutes > 0)
      byWeek.set(
        weekKey(r.date),
        (byWeek.get(weekKey(r.date)) ?? 0) + r.overtimeMinutes,
      );
  }
  let double = 0;
  let triple = 0;
  for (const minutes of byWeek.values()) {
    const hours = minutes / 60;
    double += Math.min(hours, DOUBLE_HOURS_PER_WEEK);
    triple += Math.max(0, hours - DOUBLE_HOURS_PER_WEEK);
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return { double: round2(double), triple: round2(triple) };
}

export interface PayrollInput {
  paymentType: PaymentKind;
  baseSalary: number;
  periodStart: Date;
  periodEnd: Date;
  records: PayrollAttendance[];
  latePolicy: LatePolicy;
}

/**
 * Prenómina de un empleado: el periodo completo se paga (descansos y justificadas incluidos)
 * menos las faltas, medio día por cada medio día, y las faltas por acumulación de retardos.
 */
export function computePayroll(input: PayrollInput) {
  const { records, latePolicy } = input;
  const days = periodDays(input.periodStart, input.periodEnd);
  const daily = dailySalaryCents(input.paymentType, input.baseSalary);
  const hourly = daily / WORKDAY_HOURS;

  const count = (s: AttendanceKind) =>
    records.filter((r) => r.status === s).length;
  const absences = count('absent');
  const halfDays = count('half_day');
  const lates = count('late');
  const lateAbsences = latePolicy.enabled
    ? Math.floor(lates / Math.max(1, latePolicy.latesPerAbsence))
    : 0;

  const payableDays = Math.max(
    0,
    days - absences - lateAbsences - halfDays * 0.5,
  );
  const salary = Math.round(daily * payableDays);

  const overtime = splitOvertime(records);
  const overtimeAmount = Math.round(
    hourly * 2 * overtime.double + hourly * 3 * overtime.triple,
  );

  const worked = new Set<AttendanceKind>(['present', 'late', 'half_day']);
  const sundaysWorked = records.filter(
    (r) => worked.has(r.status) && r.date.getUTCDay() === 0,
  ).length;
  const sundayPremium = Math.round(daily * SUNDAY_PREMIUM_RATE * sundaysWorked);

  return {
    dailySalary: fromCents(daily),
    periodDays: days,
    payableDays,
    absences,
    halfDays,
    lates,
    lateAbsences,
    overtimeDouble: overtime.double,
    overtimeTriple: overtime.triple,
    sundaysWorked,
    salaryAmount: fromCents(salary),
    overtimeAmount: fromCents(overtimeAmount),
    sundayPremium: fromCents(sundayPremium),
  };
}

/** Totales de la línea con sus ajustes manuales. */
export function totals(
  base: { salaryAmount: number; overtimeAmount: number; sundayPremium: number },
  adjustments: { type: 'perception' | 'deduction'; amount: number }[],
) {
  const sum = (t: 'perception' | 'deduction') =>
    adjustments
      .filter((a) => a.type === t)
      .reduce((s, a) => s + toCents(a.amount), 0);
  const perceptions =
    toCents(base.salaryAmount) +
    toCents(base.overtimeAmount) +
    toCents(base.sundayPremium) +
    sum('perception');
  const deductions = sum('deduction');
  return {
    totalPerceptions: fromCents(perceptions),
    totalDeductions: fromCents(deductions),
    netPay: fromCents(perceptions - deductions),
  };
}
