import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Profession } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

// PATCH — update salary for all employees of a given profession
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;
  const { roleId, salary } = await req.json();

  if (!roleId || !salary || salary <= 0) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findFirst({ where: { id: enterpriseId, playerId } });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  await prisma.employee.updateMany({
    where: { enterpriseId, profession: roleId as Profession },
    data: { salaryUah: salary },
  });

  return NextResponse.json({ ok: true });
}
