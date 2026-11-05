/*
  Warnings:

  - A unique constraint covering the columns `[parlevelName]` on the table `Supplier` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "parlevelName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_parlevelName_key" ON "Supplier"("parlevelName");
