-- AlterTable
ALTER TABLE "DraftVariant" ADD COLUMN     "voiceEcho" TEXT,
ADD COLUMN     "voiceMatch" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "avgClientValueCents" INTEGER NOT NULL DEFAULT 0;
