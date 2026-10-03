-- CreateEnum
CREATE TYPE "ReadingMode" AS ENUM ('OFF', 'TIMED', 'MANUAL');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "readingMode" "ReadingMode" NOT NULL DEFAULT 'TIMED',
ADD COLUMN     "readingTimeSec" INTEGER NOT NULL DEFAULT 5;
