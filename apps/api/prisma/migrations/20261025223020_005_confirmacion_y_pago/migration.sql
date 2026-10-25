/*
  Warnings:

  - A unique constraint covering the columns `[uuidKey]` on the table `Payable` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[folioKey]` on the table `Payable` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('pending', 'received');

-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "complementStatus" "DocStatus",
ADD COLUMN     "discardReason" TEXT,
ADD COLUMN     "dueOn" DATE,
ADD COLUMN     "folioKey" TEXT,
ADD COLUMN     "invoiceDocStatus" "DocStatus",
ADD COLUMN     "paidAmount" DECIMAL(14,2),
ADD COLUMN     "paidOn" DATE,
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "scheduledPayOn" DATE,
ADD COLUMN     "suggestedPayOn" DATE,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "uuidKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payable_uuidKey_key" ON "Payable"("uuidKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payable_folioKey_key" ON "Payable"("folioKey");
