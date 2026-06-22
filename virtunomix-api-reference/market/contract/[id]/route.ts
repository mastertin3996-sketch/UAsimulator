import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/market/contract/[id]
// Гравець скасовує свій контракт (як продавець або покупець)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contract = await prisma.supplyContract.findUnique({
    where: { id },
    include: {
      sellerCompany: { select: { ownerId: true } },
      buyerCompany:  { select: { ownerId: true } },
    },
  });

  if (!contract) return NextResponse.json({ error: "Контракт не знайдено" }, { status: 404 });

  const isSeller = contract.sellerCompany.ownerId === session.user.id;
  const isBuyer  = contract.buyerCompany?.ownerId === session.user.id;

  if (!isSeller && !isBuyer) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }
  if (!["OPEN", "ACTIVE", "PAUSED"].includes(contract.status)) {
    return NextResponse.json({ error: `Контракт зі статусом ${contract.status} не можна скасувати` }, { status: 409 });
  }

  await prisma.supplyContract.update({
    where: { id },
    data: { status: "TERMINATED" },
  });

  return NextResponse.json({ ok: true, contractId: id });
}

// PATCH /api/market/contract/[id]
// Пауза / відновлення контракту продавцем
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = await req.json() as { action: "pause" | "resume" };

  if (!["pause", "resume"].includes(action)) {
    return NextResponse.json({ error: "action має бути 'pause' або 'resume'" }, { status: 400 });
  }

  const contract = await prisma.supplyContract.findUnique({
    where: { id },
    include: { sellerCompany: { select: { ownerId: true } } },
  });

  if (!contract) return NextResponse.json({ error: "Контракт не знайдено" }, { status: 404 });
  if (contract.sellerCompany.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Тільки продавець може ставити на паузу" }, { status: 403 });
  }

  if (action === "pause" && contract.status !== "ACTIVE") {
    return NextResponse.json({ error: "Можна поставити на паузу тільки ACTIVE контракт" }, { status: 409 });
  }
  if (action === "resume" && contract.status !== "PAUSED") {
    return NextResponse.json({ error: "Можна відновити тільки PAUSED контракт" }, { status: 409 });
  }

  const updated = await prisma.supplyContract.update({
    where: { id },
    data: { status: action === "pause" ? "PAUSED" : "ACTIVE" },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
