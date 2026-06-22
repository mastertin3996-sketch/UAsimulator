import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const invite = await prisma.syndicateInvite.findUnique({ where: { id } });
  if (!invite || invite.invitedId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invite.status !== "PENDING")
    return NextResponse.json({ error: "Запрошення вже оброблено" }, { status: 400 });

  await prisma.syndicateInvite.update({ where: { id }, data: { status: "DECLINED" } });
  return NextResponse.json({ ok: true });
}
