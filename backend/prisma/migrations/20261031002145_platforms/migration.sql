-- AlterTable
ALTER TABLE "route_schedules" ADD COLUMN     "platform_id" UUID;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "platform_id" UUID,
ADD COLUMN     "platform_override_reason" TEXT;

-- CreateTable
CREATE TABLE "platforms" (
    "id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platforms_terminal_id_idx" ON "platforms"("terminal_id");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_terminal_id_code_key" ON "platforms"("terminal_id", "code");

-- CreateIndex
CREATE INDEX "trips_platform_id_departure_at_idx" ON "trips"("platform_id", "departure_at");

-- AddForeignKey
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
