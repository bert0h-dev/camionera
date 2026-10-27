-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('morning', 'afternoon', 'night', 'split');

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "shift_type" "ShiftType" NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedules" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "schedule_date" DATE NOT NULL,
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ,
    "shift_type" "ShiftType",
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_rest_day" BOOLEAN NOT NULL DEFAULT false,
    "template_id" UUID,
    "notes" TEXT,
    "override_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_templates_name_key" ON "shift_templates"("name");

-- CreateIndex
CREATE INDEX "staff_schedules_schedule_date_idx" ON "staff_schedules"("schedule_date");

-- CreateIndex
CREATE INDEX "staff_schedules_staff_id_start_at_idx" ON "staff_schedules"("staff_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedules_staff_id_schedule_date_key" ON "staff_schedules"("staff_id", "schedule_date");

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
