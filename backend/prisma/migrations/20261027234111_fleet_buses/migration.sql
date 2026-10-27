-- CreateEnum
CREATE TYPE "BusStatus" AS ENUM ('available', 'in_service', 'maintenance', 'out_of_service');

-- CreateEnum
CREATE TYPE "BusDocumentType" AS ENUM ('insurance', 'circulation_card', 'sict_permit', 'emissions_check', 'other');

-- CreateEnum
CREATE TYPE "OdometerSource" AS ENUM ('manual', 'maintenance', 'fuel', 'trip');

-- CreateTable
CREATE TABLE "buses" (
    "id" UUID NOT NULL,
    "economic_number" VARCHAR(20) NOT NULL,
    "plates" VARCHAR(15) NOT NULL,
    "vin" VARCHAR(17) NOT NULL,
    "year" INTEGER NOT NULL,
    "bus_model_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "odometer_km" INTEGER NOT NULL DEFAULT 0,
    "status" "BusStatus" NOT NULL DEFAULT 'available',
    "status_reason" TEXT,
    "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_service_at" TIMESTAMPTZ,
    "preventive_km" INTEGER,
    "preventive_days" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_seats" (
    "id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "number" VARCHAR(6) NOT NULL,
    "category" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "blocked_at" TIMESTAMPTZ,

    CONSTRAINT "bus_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_documents" (
    "id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "type" "BusDocumentType" NOT NULL,
    "folio" VARCHAR(60) NOT NULL,
    "issuer" VARCHAR(150),
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bus_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odometer_readings" (
    "id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "km" INTEGER NOT NULL,
    "source" "OdometerSource" NOT NULL DEFAULT 'manual',
    "recorded_by" UUID,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odometer_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buses_economic_number_key" ON "buses"("economic_number");

-- CreateIndex
CREATE UNIQUE INDEX "buses_plates_key" ON "buses"("plates");

-- CreateIndex
CREATE UNIQUE INDEX "buses_vin_key" ON "buses"("vin");

-- CreateIndex
CREATE INDEX "buses_status_idx" ON "buses"("status");

-- CreateIndex
CREATE INDEX "buses_terminal_id_idx" ON "buses"("terminal_id");

-- CreateIndex
CREATE INDEX "buses_bus_model_id_idx" ON "buses"("bus_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "bus_seats_bus_id_number_key" ON "bus_seats"("bus_id", "number");

-- CreateIndex
CREATE INDEX "bus_documents_bus_id_type_idx" ON "bus_documents"("bus_id", "type");

-- CreateIndex
CREATE INDEX "bus_documents_expiry_date_idx" ON "bus_documents"("expiry_date");

-- CreateIndex
CREATE INDEX "odometer_readings_bus_id_recorded_at_idx" ON "odometer_readings"("bus_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_bus_model_id_fkey" FOREIGN KEY ("bus_model_id") REFERENCES "bus_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_seats" ADD CONSTRAINT "bus_seats_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_documents" ADD CONSTRAINT "bus_documents_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
