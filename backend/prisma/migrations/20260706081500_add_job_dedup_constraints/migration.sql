-- DropIndex
DROP INDEX "Job_platform_externalId_idx";

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_platform_externalId_key" ON "Job"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_contentHash_key" ON "Job"("contentHash");
