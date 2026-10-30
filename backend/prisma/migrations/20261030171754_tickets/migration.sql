-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('counter', 'online');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('held', 'confirmed', 'checked_in', 'no_show', 'cancelled', 'changed');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'transfer', 'mercadopago');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'amount');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('sale', 'refund', 'withdrawal', 'deposit');

-- CreateEnum
CREATE TYPE "TicketEventType" AS ENUM ('held', 'released', 'confirmed', 'changed', 'checked_in', 'no_show', 'cancelled', 'refunded');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passenger_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "max_per_trip" INTEGER,
    "requires_id" BOOLEAN NOT NULL DEFAULT false,
    "season_types" "SeasonType"[] DEFAULT ARRAY[]::"SeasonType"[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "passenger_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "max_discount" DECIMAL(10,2),
    "max_uses" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "min_purchase" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "channels" "SaleChannel"[] DEFAULT ARRAY[]::"SaleChannel"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(20) NOT NULL,
    "channel" "SaleChannel" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "customer_id" UUID,
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(20),
    "seller_id" UUID,
    "cash_session_id" UUID,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_promotions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "discount_applied" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "ticket_number" VARCHAR(20) NOT NULL,
    "order_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "seat_number" VARCHAR(6) NOT NULL,
    "board_index" INTEGER NOT NULL,
    "alight_index" INTEGER NOT NULL,
    "board_terminal_id" UUID NOT NULL,
    "alight_terminal_id" UUID NOT NULL,
    "board_at" TIMESTAMPTZ NOT NULL,
    "alight_at" TIMESTAMPTZ NOT NULL,
    "passenger_name" VARCHAR(255) NOT NULL,
    "passenger_type_id" UUID NOT NULL,
    "passenger_document" VARCHAR(50),
    "base_price" DECIMAL(10,2) NOT NULL,
    "season_percent" DECIMAL(5,2),
    "passenger_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'held',
    "qr_token" VARCHAR(255),
    "checked_in_at" TIMESTAMPTZ,
    "checked_in_by" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "replaced_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(10,2) NOT NULL,
    "received" DECIMAL(10,2),
    "reference" VARCHAR(100),
    "gateway_payment_id" VARCHAR(100),
    "gateway_response" JSONB,
    "cash_session_id" UUID,
    "recorded_by" UUID,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "gateway_refund_id" VARCHAR(100),
    "cash_session_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "terminal_id" UUID,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'open',
    "opening_float" DECIMAL(10,2) NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "expected_cash" DECIMAL(10,2),
    "counted_cash" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "closing_notes" TEXT,
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_id" UUID,
    "refund_id" UUID,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" "TicketEventType" NOT NULL,
    "detail" JSONB,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "passenger_types_code_key" ON "passenger_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_valid_from_valid_until_idx" ON "promotions"("valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "orders_seller_id_created_at_idx" ON "orders"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "order_promotions_promotion_id_idx" ON "order_promotions"("promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_promotions_order_id_promotion_id_key" ON "order_promotions"("order_id", "promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_qr_token_key" ON "tickets"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_replaced_by_key" ON "tickets"("replaced_by");

-- CreateIndex
CREATE INDEX "tickets_trip_id_status_idx" ON "tickets"("trip_id", "status");

-- CreateIndex
CREATE INDEX "tickets_order_id_idx" ON "tickets"("order_id");

-- CreateIndex
CREATE INDEX "tickets_passenger_type_id_idx" ON "tickets"("passenger_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_payment_id_key" ON "payments"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_cash_session_id_idx" ON "payments"("cash_session_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_gateway_refund_id_key" ON "refunds"("gateway_refund_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_ticket_id_idx" ON "refunds"("ticket_id");

-- CreateIndex
CREATE INDEX "refunds_created_at_idx" ON "refunds"("created_at");

-- CreateIndex
CREATE INDEX "cash_sessions_user_id_opened_at_idx" ON "cash_sessions"("user_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_sessions_status_idx" ON "cash_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_payment_id_key" ON "cash_movements"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_refund_id_key" ON "cash_movements"("refund_id");

-- CreateIndex
CREATE INDEX "cash_movements_session_id_created_at_idx" ON "cash_movements"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_events_type_created_at_idx" ON "ticket_events"("type", "created_at");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_board_terminal_id_fkey" FOREIGN KEY ("board_terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_alight_terminal_id_fkey" FOREIGN KEY ("alight_terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_passenger_type_id_fkey" FOREIGN KEY ("passenger_type_id") REFERENCES "passenger_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Reglas que Prisma no modela ----------

-- Folios legibles de compras y boletos
CREATE SEQUENCE IF NOT EXISTS "order_number_seq";
CREATE SEQUENCE IF NOT EXISTS "ticket_number_seq";

-- Un asiento no puede tener dos boletos activos con tramos encimados (A→B y B→C sí comparten asiento)
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seat_no_overlap"
  EXCLUDE USING gist ("trip_id" WITH =, "seat_number" WITH =, int4range("board_index", "alight_index") WITH &&)
  WHERE ("status" IN ('held', 'confirmed', 'checked_in'));

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_segment_valid" CHECK ("board_index" >= 0 AND "alight_index" > "board_index");
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_amounts_valid" CHECK (
  "base_price" >= 0 AND "passenger_discount" >= 0 AND "promo_discount" >= 0 AND "vat" >= 0 AND "service_fee" >= 0 AND "total" >= 0
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_valid" CHECK (
  "subtotal" >= 0 AND "discount" >= 0 AND "vat" >= 0 AND "service_fee" >= 0 AND "total" >= 0
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_float_valid" CHECK ("opening_float" >= 0);
ALTER TABLE "passenger_types" ADD CONSTRAINT "passenger_types_discount_valid" CHECK ("discount_percent" BETWEEN 0 AND 100);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_dates_valid" CHECK ("valid_until" >= "valid_from");
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_valid" CHECK (
  "discount_value" > 0 AND ("discount_type" <> 'percent' OR "discount_value" <= 100)
);

-- Una sola caja abierta por usuario
CREATE UNIQUE INDEX "cash_sessions_one_open_per_user" ON "cash_sessions" ("user_id") WHERE ("status" = 'open');
