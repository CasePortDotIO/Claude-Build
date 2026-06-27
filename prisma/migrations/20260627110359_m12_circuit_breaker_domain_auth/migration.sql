-- AlterTable
ALTER TABLE "Mailbox" ADD COLUMN     "requiresRescrub" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "domainAuthCheckedAt" TIMESTAMP(3),
ADD COLUMN     "domainAuthOk" BOOLEAN NOT NULL DEFAULT false;
