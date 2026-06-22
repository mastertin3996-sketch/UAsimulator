import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMultiAccountAsync } from "@/lib/fraud-detection";
import { logAudit } from "@/lib/audit";

// POST /api/market/contract/sign
// Покупець підписує OPEN контракт
// Body: { contractId, buyerEnterpriseId }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contractId, buyerEnterpriseId } = await req.json() as {
    contractId: string;
    buyerEnterpriseId: string;
  };

  if (!contractId || !buyerEnterpriseId) {
    return NextResponse.json({ error: "contractId та buyerEnterpriseId — обов'язкові" }, { status: 400 });
  }

  // ── Завантажуємо контракт, покупця і гаманець ────────────────────────────
  const [contract, buyerEnterprise] = await Promise.all([
    prisma.supplyContract.findUnique({
      where: { id: contractId },
      include: {
        sellerCompany: { select: { ownerId: true, name: true } },
        product:       { select: { name: true, unit: true } },
      },
    }),
    prisma.enterprise.findUnique({
      where: { id: buyerEnterpriseId },
      include: { company: { select: { id: true, ownerId: true } } },
    }),
  ]);

  // ── Валідації ────────────────────────────────────────────────────────────
  if (!contract)          return NextResponse.json({ error: "Контракт не знайдено" }, { status: 404 });
  if (!buyerEnterprise)   return NextResponse.json({ error: "Підприємство-покупець не знайдено" }, { status: 404 });
  if (contract.status !== "OPEN") {
    return NextResponse.json({ error: `Контракт недоступний для підписання (статус: ${contract.status})` }, { status: 409 });
  }
  if (buyerEnterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Підприємство не належить вам" }, { status: 403 });
  }
  if (contract.sellerCompany.ownerId === session.user.id) {
    return NextResponse.json({ error: "Не можна підписати власний контракт" }, { status: 400 });
  }

  // ── Перевіряємо що у покупця вистачить GC хоча б на один тік ────────────
  const buyerWallet = await prisma.userWallet.findUnique({
    where: { userId: session.user.id },
  });
  const costPerTick = Number(contract.qtyPerTick) * Number(contract.pricePerUnit);
  const balance     = Number(buyerWallet?.gameCash ?? 0);

  if (balance < costPerTick) {
    return NextResponse.json({
      error: `Недостатньо GC. Потрібно на перший тік: ${costPerTick.toLocaleString("uk-UA")} GC, є: ${balance.toLocaleString("uk-UA")} GC`,
    }, { status: 400 });
  }

  // ── Підписуємо контракт ──────────────────────────────────────────────────
  const signed = await prisma.supplyContract.update({
    where: { id: contractId },
    data: {
      buyerCompanyId:   buyerEnterprise.company.id,
      buyerEnterpriseId,
      status:           "ACTIVE",
    },
    include: {
      product:         { select: { name: true, unit: true } },
      sellerEnterprise: { select: { name: true } },
      buyerEnterprise:  { select: { name: true } },
    },
  });

  const ip = req.headers.get("x-client-ip") ?? "unknown";

  // Multi-account check: async, never blocks response
  checkMultiAccountAsync({
    userId1  : session.user.id,               // buyer
    userId2  : contract.sellerCompany.ownerId, // seller
    ipAddress: ip,
  });

  // Audit log (fire-and-forget)
  logAudit({
    actorId  : session.user.id,
    targetId : contract.sellerCompany.ownerId,
    type     : "CONTRACT_SIGNED",
    amount   : costPerTick,
    currency : "GAME_CASH",
    relatedId: signed.id,
    details  : {
      contractId       : signed.id,
      productName      : signed.product.name,
      qtyPerTick       : Number(signed.qtyPerTick),
      pricePerUnit     : Number(signed.pricePerUnit),
      buyerEnterpriseId,
    },
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({
    contract: {
      id:            signed.id,
      status:        signed.status,
      productName:   signed.product.name,
      productUnit:   signed.product.unit,
      qtyPerTick:    Number(signed.qtyPerTick),
      pricePerUnit:  Number(signed.pricePerUnit),
      costPerTick,
      sellerEntName: signed.sellerEnterprise.name,
      buyerEntName:  signed.buyerEnterprise?.name,
    },
  });
}
