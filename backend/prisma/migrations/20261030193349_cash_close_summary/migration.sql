-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "commission_amount" DECIMAL(10,2),
ADD COLUMN     "commission_percent" DECIMAL(5,2),
ADD COLUMN     "summary" JSONB;
