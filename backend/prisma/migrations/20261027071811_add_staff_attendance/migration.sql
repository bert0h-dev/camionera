-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'half_day', 'absent', 'excused');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('manual', 'self', 'system');

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "schedule_id" UUID,
    "check_in_at" TIMESTAMPTZ,
    "check_out_at" TIMESTAMPTZ,
    "status" "AttendanceStatus" NOT NULL,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL,
    "recorded_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_attendance_attendance_date_idx" ON "staff_attendance"("attendance_date");

-- CreateIndex
CREATE INDEX "staff_attendance_status_idx" ON "staff_attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_staff_id_attendance_date_key" ON "staff_attendance"("staff_id", "attendance_date");

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "staff_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
