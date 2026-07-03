import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const hrPolicySchema = z.object({
  isActive:           z.boolean().optional(),
  autoAdjustSalaries: z.boolean().optional(),
  targetMood:         z.number().finite().min(0).max(1).optional(),
  maxSalaryCapUah:    z.number().finite().positive().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const policy = await prisma.hRAutomationPolicy.findUnique({ where: { playerId } });
  return NextResponse.json({ policy: policy ? {
    isActive:           policy.isActive,
    autoAdjustSalaries: policy.autoAdjustSalaries,
    targetMood:         policy.targetMood,
    maxSalaryCapUah:    Number(policy.maxSalaryCapUah),
  } : null });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const rawBody = await req.json().catch(() => null);
  const parsed  = hrPolicySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані запиту" }, { status: 400 });
  }
  const body = parsed.data;

  const policy = await prisma.hRAutomationPolicy.upsert({
    where:  { playerId },
    create: {
      playerId,
      isActive:           body.isActive           ?? true,
      autoAdjustSalaries: body.autoAdjustSalaries ?? true,
      targetMood:         body.targetMood          ?? 0.8,
      maxSalaryCapUah:    body.maxSalaryCapUah     ?? 50000,
    },
    update: {
      ...(body.isActive           !== undefined && { isActive:           body.isActive }),
      ...(body.autoAdjustSalaries !== undefined && { autoAdjustSalaries: body.autoAdjustSalaries }),
      ...(body.targetMood         !== undefined && { targetMood:         body.targetMood }),
      ...(body.maxSalaryCapUah    !== undefined && { maxSalaryCapUah:    body.maxSalaryCapUah }),
    },
  });

  return NextResponse.json({ ok: true, policy: {
    isActive:           policy.isActive,
    autoAdjustSalaries: policy.autoAdjustSalaries,
    targetMood:         policy.targetMood,
    maxSalaryCapUah:    Number(policy.maxSalaryCapUah),
  }});
}
