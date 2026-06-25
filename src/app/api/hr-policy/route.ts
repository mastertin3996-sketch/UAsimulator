import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const body = await req.json().catch(() => ({})) as {
    isActive?:           boolean;
    autoAdjustSalaries?: boolean;
    targetMood?:         number;
    maxSalaryCapUah?:    number;
  };

  if (body.targetMood !== undefined && (body.targetMood < 0 || body.targetMood > 1)) {
    return NextResponse.json({ error: "targetMood має бути 0–1" }, { status: 400 });
  }
  if (body.maxSalaryCapUah !== undefined && body.maxSalaryCapUah <= 0) {
    return NextResponse.json({ error: "maxSalaryCapUah має бути > 0" }, { status: 400 });
  }

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
