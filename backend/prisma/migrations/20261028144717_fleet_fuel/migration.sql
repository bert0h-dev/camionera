-- CreateEnum
CREATE TYPE "FuelLoadStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateTable
CREATE TABLE "fuel_loads" (
    "id" UUID NOT NULL,
    "bus_id" UUID NOT NULL,
    "fuel_type_id" UUID NOT NULL,
    "loaded_at" TIMESTAMPTZ NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unit_price" DECIMAL(10,3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "is_full_tank" BOOLEAN NOT NULL DEFAULT true,
    "station" VARCHAR(150),
    "ticket" VARCHAR(60),
    "notes" TEXT,
    "status" "FuelLoadStatus" NOT NULL DEFAULT 'confirmed',
    "reject_reason" TEXT,
    "recorded_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "trip_km" INTEGER,
    "trip_quantity" DECIMAL(10,2),
    "efficiency" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fuel_loads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_loads_bus_id_status_odometer_km_idx" ON "fuel_loads"("bus_id", "status", "odometer_km");

-- CreateIndex
CREATE INDEX "fuel_loads_status_idx" ON "fuel_loads"("status");

-- CreateIndex
CREATE INDEX "fuel_loads_loaded_at_idx" ON "fuel_loads"("loaded_at");

-- CreateIndex
CREATE INDEX "fuel_loads_recorded_by_idx" ON "fuel_loads"("recorded_by");

-- AddForeignKey
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
