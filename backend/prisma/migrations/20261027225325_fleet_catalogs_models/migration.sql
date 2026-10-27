-- CreateEnum
CREATE TYPE "BusType" AS ENUM ('standard', 'executive', 'luxury', 'double_decker');

-- CreateTable
CREATE TABLE "fuel_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "unit" VARCHAR(10) NOT NULL DEFAULT 'L',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "city_id" UUID NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_models" (
    "id" UUID NOT NULL,
    "brand" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "bus_type" "BusType" NOT NULL DEFAULT 'standard',
    "fuel_type_id" UUID NOT NULL,
    "tank_capacity" DECIMAL(8,2),
    "expected_efficiency" DECIMAL(6,2),
    "specifications" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preventive_km" INTEGER,
    "preventive_days" INTEGER,
    "layout" JSONB NOT NULL,
    "seat_count" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bus_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_types_name_key" ON "fuel_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_state_key" ON "cities"("name", "state");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_code_key" ON "terminals"("code");

-- CreateIndex
CREATE INDEX "terminals_city_id_idx" ON "terminals"("city_id");

-- CreateIndex
CREATE INDEX "bus_models_bus_type_idx" ON "bus_models"("bus_type");

-- CreateIndex
CREATE UNIQUE INDEX "bus_models_brand_model_key" ON "bus_models"("brand", "model");

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_models" ADD CONSTRAINT "bus_models_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
