-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('preventive', 'corrective');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('normal', 'urgent');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'mechanic';

-- AlterTable
ALTER TABLE "buses" ADD COLUMN     "last_service_at" TIMESTAMPTZ,
ADD COLUMN     "last_service_km" INTEGER;

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" UUID NOT NULL,
    "folio" SERIAL NOT NULL,
    "bus_id" UUID NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'scheduled',
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'normal',
    "description" TEXT NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "external_shop" VARCHAR(150),
    "mechanic_id" UUID,
    "started_at" TIMESTAMPTZ,
    "start_km" INTEGER,
    "completed_at" TIMESTAMPTZ,
    "end_km" INTEGER,
    "work_performed" TEXT,
    "labor_cost" DECIMAL(12,2),
    "parts_cost" DECIMAL(12,2),
    "cancel_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tasks" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ,

    CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_task_templates" (
    "id" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_orders_folio_key" ON "maintenance_orders"("folio");

-- CreateIndex
CREATE INDEX "maintenance_orders_bus_id_status_idx" ON "maintenance_orders"("bus_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_orders_status_scheduled_date_idx" ON "maintenance_orders"("status", "scheduled_date");

-- CreateIndex
CREATE INDEX "maintenance_orders_mechanic_id_idx" ON "maintenance_orders"("mechanic_id");

-- CreateIndex
CREATE INDEX "maintenance_tasks_order_id_idx" ON "maintenance_tasks"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_task_templates_description_key" ON "maintenance_task_templates"("description");

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "maintenance_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
