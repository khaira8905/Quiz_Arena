-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
ADD COLUMN     "posterUrl" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "videoAssetId" TEXT;

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_kind_idx" ON "MediaAsset"("ownerId", "kind");

-- CreateIndex
CREATE INDEX "Question_videoAssetId_idx" ON "Question"("videoAssetId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
