-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ORGANISER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'ORGANISER';

-- Everyone who already had an account set the app up: they become admins.
UPDATE "User" SET "role" = 'ADMIN';
