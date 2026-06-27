-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'SHOWED';
ALTER TYPE "BookingStatus" ADD VALUE 'RESCHEDULED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "CalendarConnection" ADD COLUMN     "allowOutOfHours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bufferMin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "businessEndHour" INTEGER NOT NULL DEFAULT 17,
ADD COLUMN     "businessStartHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "slotDurationMin" INTEGER NOT NULL DEFAULT 30;

-- CreateIndex
CREATE INDEX "Booking_orgId_status_startsAt_idx" ON "Booking"("orgId", "status", "startsAt");
