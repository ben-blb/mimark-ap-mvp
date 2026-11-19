-- AlterEnum
ALTER TYPE "LedgerSource" ADD VALUE 'bank_pdf';

-- AlterEnum
ALTER TYPE "UploadStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "SourceUpload" ADD COLUMN     "draft" JSONB,
ADD COLUMN     "meta" JSONB;
