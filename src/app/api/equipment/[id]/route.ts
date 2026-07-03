import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EquipmentService } from "@/engine/EquipmentService";

type Params = { params: Promise<{ id: string }> };

const equipmentActionSchema = z.object({
  action: z.enum(["maintenance", "repair"]),
});

// POST /api/equipment/[id] — body: { action: "maintenance" | "repair" }
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }    = await params;
  const playerId  = session.user.id;

  const rawBody = await req.json().catch(() => null);
  const parsed  = equipmentActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be 'maintenance' or 'repair'" }, { status: 400 });
  }
  const { action } = parsed.data;

  try {
    const svc = new EquipmentService(prisma);
    if (action === "repair") {
      await svc.repairBroken(id, playerId);
    } else {
      await svc.performMaintenance(id, playerId);
    }

    const eq = await prisma.equipment.findUnique({
      where:  { id },
      select: { status: true, wearAndTear: true, isBroken: true },
    });

    return NextResponse.json({ ok: true, ...eq });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
