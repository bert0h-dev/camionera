-- CreateEnum
CREATE TYPE "SeasonType" AS ENUM ('low', 'normal', 'high', 'holiday');

-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/Mexico_City';

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "origin_terminal_id" UUID NOT NULL,
    "destination_terminal_id" UUID NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "distance_km" DECIMAL(8,2) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "stop_order" INTEGER NOT NULL,
    "duration_from_origin_minutes" INTEGER NOT NULL,
    "additional_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_schedules" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "departure_time" TIME NOT NULL,
    "days_of_week" INTEGER[],
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "route_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "season_type" "SeasonType" NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "price_modifier_percent" DECIMAL(5,2) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "routes_code_key" ON "routes"("code");

-- CreateIndex
CREATE INDEX "routes_origin_terminal_id_destination_terminal_id_idx" ON "routes"("origin_terminal_id", "destination_terminal_id");

-- CreateIndex
CREATE INDEX "routes_destination_terminal_id_idx" ON "routes"("destination_terminal_id");

-- CreateIndex
CREATE INDEX "routes_is_active_idx" ON "routes"("is_active");

-- CreateIndex
CREATE INDEX "route_stops_terminal_id_idx" ON "route_stops"("terminal_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_id_stop_order_key" ON "route_stops"("route_id", "stop_order");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_id_terminal_id_key" ON "route_stops"("route_id", "terminal_id");

-- CreateIndex
CREATE INDEX "route_schedules_route_id_idx" ON "route_schedules"("route_id");

-- CreateIndex
CREATE INDEX "route_schedules_valid_from_valid_until_idx" ON "route_schedules"("valid_from", "valid_until");

-- CreateIndex
CREATE INDEX "seasons_valid_from_valid_until_idx" ON "seasons"("valid_from", "valid_until");

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_origin_terminal_id_fkey" FOREIGN KEY ("origin_terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_destination_terminal_id_fkey" FOREIGN KEY ("destination_terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
