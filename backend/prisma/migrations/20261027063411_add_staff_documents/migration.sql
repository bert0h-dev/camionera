-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "CertificationType" AS ENUM ('medical_exam', 'first_aid', 'defensive_driving', 'training', 'other');

-- CreateTable
CREATE TABLE "staff_licenses" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "license_type" "LicenseType" NOT NULL,
    "license_number" VARCHAR(50) NOT NULL,
    "issuer" VARCHAR(100) NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_certifications" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "type" "CertificationType" NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "issuer" VARCHAR(150),
    "certificate_number" VARCHAR(100),
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_value" TEXT NOT NULL,
    "setting_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_licenses_expiry_date_idx" ON "staff_licenses"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_licenses_staff_id_license_number_key" ON "staff_licenses"("staff_id", "license_number");

-- CreateIndex
CREATE INDEX "staff_certifications_staff_id_idx" ON "staff_certifications"("staff_id");

-- CreateIndex
CREATE INDEX "staff_certifications_expiry_date_idx" ON "staff_certifications"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "system_settings"("setting_key");

-- AddForeignKey
ALTER TABLE "staff_licenses" ADD CONSTRAINT "staff_licenses_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_certifications" ADD CONSTRAINT "staff_certifications_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
