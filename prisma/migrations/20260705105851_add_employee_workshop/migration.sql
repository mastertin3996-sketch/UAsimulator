-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "workshopId" TEXT;

-- CreateIndex
CREATE INDEX "Employee_workshopId_idx" ON "Employee"("workshopId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
