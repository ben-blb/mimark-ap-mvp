-- AlterEnum
ALTER TYPE "ReceiptStatus" ADD VALUE 'received_with_differences';

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "receivedQuantity" DECIMAL(12,3);

-- Las órdenes ya recibidas se recibieron completas: lo recibido es lo pedido.
UPDATE "PurchaseOrderLine" AS l
SET "receivedQuantity" = l."quantity"
FROM "PurchaseOrder" AS po
WHERE po."id" = l."purchaseOrderId" AND po."receiptStatus" = 'received';
