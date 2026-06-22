import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const tickSecret = process.env.TICK_SECRET ?? "";
  if (tickSecret) {
    const secret = req.headers.get("x-admin-secret") ?? "";
    if (secret !== tickSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const hash = await bcrypt.hash("botpass123", 8);

  const user = await prisma.user.upsert({
    where : { email: "zelensky@sim.virtunomix" },
    update: { username: "Зеленський Володимир" },
    create: {
      email       : "zelensky@sim.virtunomix",
      username    : "Зеленський Володимир",
      passwordHash: hash,
      level       : 5,
      wallet      : { create: { gameCash: 500_000, premiumCoin: 0 } },
    },
  });

  await prisma.userWallet.upsert({
    where : { userId: user.id },
    update: { gameCash: 500_000 },
    create: { userId: user.id, gameCash: 500_000, premiumCoin: 0 },
  });

  let company = await prisma.company.findFirst({ where: { ownerId: user.id } });
  if (!company) {
    company = await prisma.company.create({
      data: { ownerId: user.id, name: "Народна Корпорація", rating: 150 },
    });
  }

  const kyiv = await prisma.city.findUnique({ where: { id: "city-kyiv" } });
  if (!kyiv) return NextResponse.json({ error: "Місто Київ не знайдено" }, { status: 500 });

  const ents = [
    { id: "sim-zelensky-0", name: "Ферма Зеленського",    typeId: "etype-wheat-farm", recipe: "recipe-harvest-wheat", workers: 5, quality: 7.5, salary: 120, stock: [] as any[] },
    { id: "sim-zelensky-1", name: "Млин Зеленського",     typeId: "etype-mill",       recipe: "recipe-milling",       workers: 8, quality: 7.0, salary: 130, stock: [{ productId: "prod-wheat", qty: 1000, quality: 7.5, avgCost: 7 }] },
    { id: "sim-zelensky-2", name: "Хлібозавод Зеленського", typeId: "etype-bakery",   recipe: "recipe-baking",        workers: 6, quality: 7.5, salary: 140, stock: [{ productId: "prod-flour", qty: 800, quality: 7.0, avgCost: 17 }] },
    { id: "sim-zelensky-3", name: "Народний магазин",     typeId: "etype-grocery",    recipe: null,                   workers: 3, quality: 8.0, salary: 100, stock: [{ productId: "prod-bread", qty: 2000, quality: 7.5, avgCost: 20 }] },
  ];

  const eIds: string[] = [];

  for (const e of ents) {
    const ent = await prisma.enterprise.upsert({
      where : { id: e.id },
      update: { isActive: true, workersCurrent: e.workers, quality: e.quality },
      create: {
        id              : e.id,
        companyId       : company.id,
        enterpriseTypeId: e.typeId,
        recipeId        : e.recipe,
        cityId          : kyiv.id,
        name            : e.name,
        level           : 2,
        size            : 1,
        workersCurrent  : e.workers,
        workersMax      : e.workers,
        salaryOffered   : e.salary,
        quality         : e.quality,
        efficiency      : 1.0,
      },
    });
    eIds.push(ent.id);

    for (const s of e.stock) {
      await prisma.inventory.upsert({
        where : { ownerType_enterpriseId_productId: { ownerType: "enterprise", enterpriseId: ent.id, productId: s.productId } },
        update: { quantity: s.qty, quality: s.quality, avgCost: s.avgCost },
        create: { ownerType: "enterprise", enterpriseId: ent.id, productId: s.productId, quantity: s.qty, quality: s.quality, avgCost: s.avgCost },
      });
    }
  }

  // Shop
  await prisma.shopSetting.upsert({
    where : { enterpriseId_productId: { enterpriseId: eIds[3], productId: "prod-bread" } },
    update: { retailPrice: 33, markupPct: 32 },
    create: { enterpriseId: eIds[3], productId: "prod-bread", retailPrice: 33, markupPct: 32 },
  });

  // Contracts
  const contracts = [
    { id: "sim-zelensky-c0", seller: eIds[0], buyer: eIds[1], product: "prod-wheat", qty: 600,  price: 5  },
    { id: "sim-zelensky-c1", seller: eIds[1], buyer: eIds[2], product: "prod-flour", qty: 450,  price: 14 },
    { id: "sim-zelensky-c2", seller: eIds[2], buyer: eIds[3], product: "prod-bread", qty: 1200, price: 21 },
  ];

  for (const c of contracts) {
    await prisma.supplyContract.upsert({
      where : { id: c.id },
      update: { status: "ACTIVE", qtyPerTick: c.qty, pricePerUnit: c.price },
      create: {
        id                : c.id,
        sellerCompanyId   : company.id,
        buyerCompanyId    : company.id,
        sellerEnterpriseId: c.seller,
        buyerEnterpriseId : c.buyer,
        productId         : c.product,
        qtyPerTick        : c.qty,
        pricePerUnit      : c.price,
        status            : "ACTIVE",
        quality           : 5.0,
      },
    });
  }

  // Market offer
  await prisma.marketOffer.create({
    data: {
      sellerCompanyId: company.id,
      productId      : "prod-flour",
      cityId         : kyiv.id,
      price          : 18,
      quantity       : 1000,
      status         : "ACTIVE",
      quality        : 7.0,
      expiresAt      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({
    ok     : true,
    userId : user.id,
    company: company.name,
    enterprises: eIds.length,
  });
}
