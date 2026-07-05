import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; employeeId: string }> };

const reassignSchema = z.object({
  workshopId: z.string().min(1).nullable(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: enterpriseId, employeeId } = await params;

  const rawBody = await req.json().catch(() => null);
  const parsed  = reassignSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен workshopId (або null)" }, { status: 400 });
  }
  const { workshopId } = parsed.data;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, enterpriseId, playerId },
  });
  if (!employee) return NextResponse.json({ error: "Співробітника не знайдено" }, { status: 404 });

  if (workshopId !== null) {
    const workshop = await prisma.workshop.findFirst({ where: { id: workshopId, enterpriseId } });
    if (!workshop) return NextResponse.json({ error: "Цех не знайдено" }, { status: 404 });
  }

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data:  { workshopId },
  });

  return NextResponse.json({ ok: true, employee: { id: updated.id, workshopId: updated.workshopId } });
}
