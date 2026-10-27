-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('draft', 'finalized', 'acknowledged');

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "applies_to" "StaffRole"[] DEFAULT ARRAY[]::"StaffRole"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_evaluations" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'draft',
    "overall_score" DECIMAL(3,2),
    "strengths" TEXT,
    "improvements" TEXT,
    "comments" TEXT,
    "employee_comment" TEXT,
    "finalized_at" TIMESTAMPTZ,
    "acknowledged_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_evaluation_scores" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "criterion_name" VARCHAR(100) NOT NULL,
    "weight" INTEGER NOT NULL,
    "score" SMALLINT,
    "comment" TEXT,

    CONSTRAINT "staff_evaluation_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_criteria_name_key" ON "evaluation_criteria"("name");

-- CreateIndex
CREATE INDEX "staff_evaluations_staff_id_period_start_idx" ON "staff_evaluations"("staff_id", "period_start");

-- CreateIndex
CREATE INDEX "staff_evaluations_status_idx" ON "staff_evaluations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_evaluation_scores_evaluation_id_criterion_id_key" ON "staff_evaluation_scores"("evaluation_id", "criterion_id");

-- AddForeignKey
ALTER TABLE "staff_evaluations" ADD CONSTRAINT "staff_evaluations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_evaluations" ADD CONSTRAINT "staff_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_evaluation_scores" ADD CONSTRAINT "staff_evaluation_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "staff_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_evaluation_scores" ADD CONSTRAINT "staff_evaluation_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
