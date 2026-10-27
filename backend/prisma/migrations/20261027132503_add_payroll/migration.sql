-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('daily', 'monthly');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('weekly', 'biweekly');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('draft', 'closed', 'paid');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('perception', 'deduction');

-- CreateTable
CREATE TABLE "staff_compensations" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "payment_type" "PaymentType" NOT NULL DEFAULT 'daily',
    "base_salary" DECIMAL(12,2) NOT NULL,
    "payment_frequency" "PaymentFrequency" NOT NULL DEFAULT 'weekly',
    "effective_from" DATE NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "frequency" "PaymentFrequency" NOT NULL DEFAULT 'weekly',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "payment_type" "PaymentType" NOT NULL,
    "base_salary" DECIMAL(12,2) NOT NULL,
    "daily_salary" DECIMAL(12,2) NOT NULL,
    "period_days" INTEGER NOT NULL,
    "payable_days" DECIMAL(5,2) NOT NULL,
    "absences" INTEGER NOT NULL DEFAULT 0,
    "half_days" INTEGER NOT NULL DEFAULT 0,
    "lates" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_absences" INTEGER NOT NULL DEFAULT 0,
    "overtime_double" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtime_triple" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "sundays_worked" INTEGER NOT NULL DEFAULT 0,
    "salary_amount" DECIMAL(12,2) NOT NULL,
    "overtime_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sunday_premium" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_perceptions" DECIMAL(12,2) NOT NULL,
    "total_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "concept" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_compensations_staff_id_effective_from_idx" ON "staff_compensations"("staff_id", "effective_from");

-- CreateIndex
CREATE INDEX "payroll_periods_period_start_idx" ON "payroll_periods"("period_start");

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_period_id_staff_id_key" ON "payroll_entries"("period_id", "staff_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_entry_id_idx" ON "payroll_adjustments"("entry_id");

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
