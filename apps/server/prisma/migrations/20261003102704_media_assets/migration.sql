-- CreateEnum
CREATE TYPE "ImageFit" AS ENUM ('CONTAIN', 'COVER');

-- CreateEnum
CREATE TYPE "ImagePosition" AS ENUM ('CENTER', 'TOP', 'BOTTOM');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('UPLOAD', 'GOOGLE_DRIVE');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "imageAssetId" TEXT,
ADD COLUMN     "imageFit" "ImageFit" NOT NULL DEFAULT 'CONTAIN',
ADD COLUMN     "imagePosition" "ImagePosition" NOT NULL DEFAULT 'CENTER';

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "variants" JSONB NOT NULL DEFAULT '{}',
    "placeholder" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "source" "MediaSource" NOT NULL DEFAULT 'UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_createdAt_idx" ON "MediaAsset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Question_imageAssetId_idx" ON "Question"("imageAssetId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
