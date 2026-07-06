-- AlterTable
ALTER TABLE "Posta" ADD COLUMN     "creadoPorUserId" TEXT;

-- CreateIndex
CREATE INDEX "Posta_creadoPorUserId_idx" ON "Posta"("creadoPorUserId");

-- AddForeignKey
ALTER TABLE "Posta" ADD CONSTRAINT "Posta_creadoPorUserId_fkey" FOREIGN KEY ("creadoPorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
