/*
  Warnings:

  - You are about to drop the column `additional_price` on the `route_stops` table. All the data in the column will be lost.
  - Added the required column `km_from_origin` to the `route_stops` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price_from_origin` to the `route_stops` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "route_stops" DROP COLUMN "additional_price",
ADD COLUMN     "km_from_origin" DECIMAL(8,2) NOT NULL,
ADD COLUMN     "price_from_origin" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "routes" ALTER COLUMN "distance_km" DROP NOT NULL;
