-- CreateEnum
CREATE TYPE "LedgerSource" AS ENUM ('parlevel_sales', 'parlevel_waste', 'cantaloupe', 'bank_csv', 'cash', 'payroll');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('previewed', 'confirmed', 'superseded', 'discarded');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "ReportPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceUpload" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "source" "LedgerSource" NOT NULL,
    "accountId" TEXT,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'previewed',
    "uploadedBy" TEXT NOT NULL,
    "rowsRead" INTEGER NOT NULL,
    "rowsRejected" INTEGER NOT NULL,
    "entriesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kioskId" TEXT,
    "accountId" TEXT,
    "source" "LedgerSource" NOT NULL,
    "uploadId" TEXT,
    "rowNumber" INTEGER,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "categoryId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "transferGroupId" TEXT,
    "meta" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportPeriod_companyId_month_key" ON "ReportPeriod"("companyId", "month");

-- CreateIndex
CREATE INDEX "SourceUpload_periodId_source_idx" ON "SourceUpload"("periodId", "source");

-- CreateIndex
CREATE INDEX "LedgerEntry_periodId_source_idx" ON "LedgerEntry"("periodId", "source");

-- CreateIndex
CREATE INDEX "LedgerEntry_kioskId_idx" ON "LedgerEntry"("kioskId");

-- CreateIndex
CREATE INDEX "LedgerEntry_uploadId_idx" ON "LedgerEntry"("uploadId");

-- AddForeignKey
ALTER TABLE "ReportPeriod" ADD CONSTRAINT "ReportPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceUpload" ADD CONSTRAINT "SourceUpload_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceUpload" ADD CONSTRAINT "SourceUpload_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Kiosk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "SourceUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
