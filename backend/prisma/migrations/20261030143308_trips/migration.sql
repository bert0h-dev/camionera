-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('scheduled', 'boarding', 'in_transit', 'delayed', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "bus_incidents" ADD COLUMN     "trip_id" UUID;

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "trip_number" VARCHAR(40) NOT NULL,
    "route_id" UUID NOT NULL,
    "route_schedule_id" UUID,
    "trip_date" DATE NOT NULL,
    "departure_at" TIMESTAMPTZ NOT NULL,
    "arrival_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'scheduled',
    "bus_id" UUID,
    "driver_id" UUID,
    "collector_id" UUID,
    "override_reason" TEXT,
    "actual_departure_at" TIMESTAMPTZ,
    "actual_arrival_at" TIMESTAMPTZ,
    "start_odometer_km" INTEGER,
    "end_odometer_km" INTEGER,
    "notes" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_status_log" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "from_status" "TripStatus",
    "to_status" "TripStatus" NOT NULL,
    "reason" TEXT,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trips_trip_number_key" ON "trips"("trip_number");

-- CreateIndex
CREATE INDEX "trips_trip_date_status_idx" ON "trips"("trip_date", "status");

-- CreateIndex
CREATE INDEX "trips_route_id_trip_date_idx" ON "trips"("route_id", "trip_date");

-- CreateIndex
CREATE INDEX "trips_bus_id_departure_at_idx" ON "trips"("bus_id", "departure_at");

-- CreateIndex
CREATE INDEX "trips_driver_id_departure_at_idx" ON "trips"("driver_id", "departure_at");

-- CreateIndex
CREATE INDEX "trips_collector_id_departure_at_idx" ON "trips"("collector_id", "departure_at");

-- CreateIndex
CREATE UNIQUE INDEX "trips_route_schedule_id_trip_date_key" ON "trips"("route_schedule_id", "trip_date");

-- CreateIndex
CREATE INDEX "trip_status_log_trip_id_changed_at_idx" ON "trip_status_log"("trip_id", "changed_at");

-- CreateIndex
CREATE INDEX "bus_incidents_trip_id_idx" ON "bus_incidents"("trip_id");

-- AddForeignKey
ALTER TABLE "bus_incidents" ADD CONSTRAINT "bus_incidents_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_schedule_id_fkey" FOREIGN KEY ("route_schedule_id") REFERENCES "route_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_status_log" ADD CONSTRAINT "trip_status_log_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_status_log" ADD CONSTRAINT "trip_status_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no modela (ver docs/16-modulo5-recorridos.md)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "trips" ADD CONSTRAINT "trips_arrival_after_departure" CHECK ("arrival_at" > "departure_at");

-- Una unidad, un conductor o un cobrador no puede estar en dos recorridos que se encimen (sin contar los cancelados)
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_no_overlap"
  EXCLUDE USING gist ("bus_id" WITH =, tstzrange("departure_at", "arrival_at") WITH &&)
  WHERE ("bus_id" IS NOT NULL AND "status" <> 'cancelled');
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_no_overlap"
  EXCLUDE USING gist ("driver_id" WITH =, tstzrange("departure_at", "arrival_at") WITH &&)
  WHERE ("driver_id" IS NOT NULL AND "status" <> 'cancelled');
ALTER TABLE "trips" ADD CONSTRAINT "trips_collector_no_overlap"
  EXCLUDE USING gist ("collector_id" WITH =, tstzrange("departure_at", "arrival_at") WITH &&)
  WHERE ("collector_id" IS NOT NULL AND "status" <> 'cancelled');
