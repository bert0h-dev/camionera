-- Secuencia para el número de empleado (EMP-000001)
CREATE SEQUENCE "staff_employee_number_seq" START 1;

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('driver', 'collector', 'mechanic', 'supervisor', 'vendor', 'hr', 'admin_staff');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('active', 'inactive', 'vacation', 'sick_leave', 'suspended');

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "employee_number" VARCHAR(20) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "second_last_name" VARCHAR(100),
    "curp" VARCHAR(18),
    "rfc" VARCHAR(13),
    "nss" VARCHAR(11),
    "birth_date" DATE NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20) NOT NULL,
    "address" TEXT,
    "emergency_contact" VARCHAR(255),
    "emergency_phone" VARCHAR(20),
    "role" "StaffRole" NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'active',
    "hire_date" DATE NOT NULL,
    "termination_date" DATE,
    "termination_reason" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_employee_number_key" ON "staff"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "staff_curp_key" ON "staff"("curp");

-- CreateIndex
CREATE UNIQUE INDEX "staff_rfc_key" ON "staff"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "staff_nss_key" ON "staff"("nss");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE INDEX "staff_role_idx" ON "staff"("role");

-- CreateIndex
CREATE INDEX "staff_status_idx" ON "staff"("status");

-- CreateIndex
CREATE INDEX "staff_last_name_first_name_idx" ON "staff"("last_name", "first_name");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
