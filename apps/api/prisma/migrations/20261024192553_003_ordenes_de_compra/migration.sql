-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('open', 'cancelled');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('pending', 'received');

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "parlevelRef" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'open',
    "receiptStatus" "ReceiptStatus" NOT NULL DEFAULT 'pending',
    "receivedOn" DATE,
    "receivedBy" TEXT,
    "receiptNotes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
