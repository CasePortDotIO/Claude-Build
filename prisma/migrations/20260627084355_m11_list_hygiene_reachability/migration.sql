-- CreateEnum
CREATE TYPE "Reachability" AS ENUM ('REACHABLE', 'RISKY', 'INVALID');

-- AlterEnum
ALTER TYPE "SuppressionReason" ADD VALUE 'INVALID';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "reachability" "Reachability" NOT NULL DEFAULT 'REACHABLE',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifyReason" TEXT;
