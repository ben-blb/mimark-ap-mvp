-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('uploaded', 'processing', 'requires_review', 'pending_confirmation', 'confirmed', 'scheduled', 'paid', 'out_of_scope', 'failed', 'discarded');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('factura', 'ticket', 'remision', 'otro');

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'uploaded',
    "createdBy" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "selectedPoNumber" TEXT,
    "invoiceReceivedOn" DATE NOT NULL,
    "extraction" JSONB,
    "isApDocument" BOOLEAN,
    "docType" "DocType",
    "supplierName" TEXT,
    "supplierTaxId" TEXT,
    "invoiceNumber" TEXT,
    "issueDate" DATE,
    "poNumber" TEXT,
    "subtotal" DECIMAL(14,2),
    "taxes" DECIMAL(14,2),
    "total" DECIMAL(14,2),
    "currency" "Currency",
    "taxUuid" TEXT,
    "uncertainFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failureCode" TEXT,
    "purchaseOrderId" TEXT,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payable_status_idx" ON "Payable"("status");

-- CreateIndex
CREATE INDEX "Payable_taxUuid_idx" ON "Payable"("taxUuid");

-- CreateIndex
CREATE INDEX "Payable_supplierTaxId_invoiceNumber_idx" ON "Payable"("supplierTaxId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payable_purchaseOrderId_idx" ON "Payable"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
