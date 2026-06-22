import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateContractPrice } from "@/lib/fraud-detection";
import { logAudit } from "@/lib/audit";

// POST /api/market/contract/create
// Продавець виставляє повторюваний B2B контракт
// Body: { sellerEnterpriseId, productId, qtyPerTick, pricePerUnit, durationTicks? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    sellerEnterpriseId,
    productId,
    qtyPerTick,
    pricePerUnit,
    durationTicks,
  } = await req.json() as {
    sellerEnterpriseId: string;
    productId: string;
    qtyPerTick: number;
    pricePerUnit: number;
    durationTicks?: number;
  };

  // ── Валідація вхідних даних ──────────────────────────────────────────────
  if (!sellerEnterpriseId || !productId || !qtyPerTick || !pricePerUnit) {
    return NextResponse.json(
      { error: "sellerEnterpriseId, productId, qtyPerTick, pricePerUnit — обов'язкові" },
      { status: 400 },
    );
  }
  if (qtyPerTick <= 0) return NextResponse.json({ error: "qtyPerTick має бути > 0" }, { status: 400 });
  if (pricePerUnit <= 0) return NextResponse.json({ error: "pricePerUnit має бути > 0" }, { status: 400 });
  if (durationTicks !== undefined && (durationTicks < 1 || durationTicks > 1000)) {
    return NextResponse.json({ error: "durationTicks: 1..1000" }, { status: 400 });
  }

  // ── Перевіряємо що підприємство-продавець належить гравцю ───────────────
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: sellerEnterpriseId },
    include: { company: { select: { id: true, ownerId: true } } },
  });

  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  // ── Перевіряємо що товар реально є на складі ────────────────────────────
  const inv = await prisma.inventory.findFirst({
    where: { ownerType: "enterprise", enterpriseId: sellerEnterpriseId, productId },
    include: { product: { select: { name: true } } },
  });
  if (!inv || Number(inv.quantity) <= 0) {
    return NextResponse.json(
      { error: "Товар відсутній на складі підприємства-продавця" },
      { status: 400 },
    );
  }

  // ── Перевіряємо чи немає вже активного контракту на цей самий товар ─────
  const existing = await prisma.supplyContract.findFirst({
    where: {
      sellerEnterpriseId,
      productId,
      status: { in: ["OPEN", "ACTIVE"] },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "На цей товар з цього підприємства вже є активний контракт" },
      { status: 409 },
    );
  }

  // ── Перевірка цін на шахрайство ─────────────────────────────────────────
  const priceCheck = await validateContractPrice({
    sellerEnterpriseId,
    productId,
    pricePerUnit,
    sellerId: session.user.id,
  });
  if (!priceCheck.allowed) {
    logAudit({
      actorId  : session.user.id,
      type     : "SUSPICIOUS_BLOCKED",
      relatedId: sellerEnterpriseId,
      details  : { pricePerUnit, reason: priceCheck.reason },
      ipAddress: req.headers.get("x-client-ip") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ error: priceCheck.reason }, { status: 422 });
  }

  // ── Створюємо контракт ───────────────────────────────────────────────────
  const contract = await prisma.supplyContract.create({
    data: {
      sellerCompanyId:    enterprise.company.id,
      sellerEnterpriseId,
      productId,
      qtyPerTick,
      pricePerUnit,
      quality:            Number(inv.quality),
      durationTicks:      durationTicks ?? null,
      status:             "OPEN",
    },
    include: {
      product: { select: { name: true, unit: true } },
      sellerEnterprise: { select: { name: true } },
    },
  });

  // Audit log (fire-and-forget)
  logAudit({
    actorId  : session.user.id,
    type     : "CONTRACT_CREATED",
    relatedId: contract.id,
    amount   : pricePerUnit,
    currency : "GAME_CASH",
    details  : { productId, qtyPerTick, pricePerUnit, durationTicks: durationTicks ?? null },
    ipAddress: req.headers.get("x-client-ip") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({
    contract: {
      id:            contract.id,
      status:        contract.status,
      productName:   contract.product.name,
      productUnit:   contract.product.unit,
      qtyPerTick:    Number(contract.qtyPerTick),
      pricePerUnit:  Number(contract.pricePerUnit),
      quality:       Number(contract.quality),
      durationTicks: contract.durationTicks,
      sellerEntName: contract.sellerEnterprise.name,
    },
  }, { status: 201 });
}
