-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "session_started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
