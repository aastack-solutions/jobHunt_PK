-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "applyUrl" TEXT,
ADD COLUMN     "resumeId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "ApplyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "loginUrl" TEXT,
    "credentialEncrypted" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionStateEncrypted" BYTEA,
    "sessionStateIv" BYTEA,
    "sessionStateAuthTag" BYTEA,
    "sessionStateSavedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplyTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "applicationId" TEXT,
    "applyUrl" TEXT NOT NULL,
    "adapterUsed" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "failureClass" TEXT,
    "fieldsFilled" JSONB,
    "confidenceScore" INTEGER,
    "failureReason" TEXT,
    "screenshotKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "captchaDetectedAt" TIMESTAMP(3),
    "captchaSolvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_resumeId_idx" ON "Application"("resumeId");

-- CreateIndex
CREATE INDEX "ApplyCredential_userId_idx" ON "ApplyCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplyCredential_userId_platform_key" ON "ApplyCredential"("userId", "platform");

-- CreateIndex
CREATE INDEX "ApplyTask_userId_status_idx" ON "ApplyTask"("userId", "status");

-- CreateIndex
CREATE INDEX "ApplyTask_userId_createdAt_idx" ON "ApplyTask"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplyTask_jobId_idx" ON "ApplyTask"("jobId");

-- CreateIndex
CREATE INDEX "ApplyTask_status_idx" ON "ApplyTask"("status");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplyCredential" ADD CONSTRAINT "ApplyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplyTask" ADD CONSTRAINT "ApplyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplyTask" ADD CONSTRAINT "ApplyTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
