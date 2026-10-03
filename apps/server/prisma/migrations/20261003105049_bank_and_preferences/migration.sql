-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "difficulty" "Difficulty",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "autoRevealSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leaderboardEvery" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';
