-- CreateIndex
CREATE INDEX "ApplyTask_applicationId_idx" ON "ApplyTask"("applicationId");

-- AddForeignKey
ALTER TABLE "ApplyTask" ADD CONSTRAINT "ApplyTask_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
