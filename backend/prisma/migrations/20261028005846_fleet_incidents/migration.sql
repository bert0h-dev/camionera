-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('reported', 'in_review', 'resolved', 'dismissed');

-- AlterTable
ALTER TABLE "maintenance_orders" ADD COLUMN     "incident_id" UUID;

-- CreateTable
CREATE TABLE "incident_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_accident" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "incident_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_incidents" (
    "id" UUID NOT NULL,
    "folio" SERIAL NOT NULL,
    "bus_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'reported',
    "description" TEXT NOT NULL,
    "location" VARCHAR(200),
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "odometer_km" INTEGER,
    "reported_by" UUID NOT NULL,
    "claim_number" VARCHAR(50),
    "insurer" VARCHAR(150),
    "third_parties" BOOLEAN,
    "injuries" BOOLEAN,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "resolution" TEXT,
    "took_bus_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bus_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incident_categories_name_key" ON "incident_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bus_incidents_folio_key" ON "bus_incidents"("folio");

-- CreateIndex
CREATE INDEX "bus_incidents_bus_id_status_idx" ON "bus_incidents"("bus_id", "status");

-- CreateIndex
CREATE INDEX "bus_incidents_status_severity_idx" ON "bus_incidents"("status", "severity");

-- CreateIndex
CREATE INDEX "bus_incidents_reported_by_idx" ON "bus_incidents"("reported_by");

-- CreateIndex
CREATE INDEX "maintenance_orders_incident_id_idx" ON "maintenance_orders"("incident_id");

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "bus_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_incidents" ADD CONSTRAINT "bus_incidents_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_incidents" ADD CONSTRAINT "bus_incidents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "incident_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_incidents" ADD CONSTRAINT "bus_incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_incidents" ADD CONSTRAINT "bus_incidents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
