-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('normal', 'internal_transfer');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "cantaloupeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0340;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "kind" "EntryKind" NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "ReportPeriod" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedBy" TEXT,
ADD COLUMN     "reopenReason" TEXT;

-- CreateTable
CREATE TABLE "TransferGroup" (
    "id" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transferGroupId_fkey" FOREIGN KEY ("transferGroupId") REFERENCES "TransferGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
