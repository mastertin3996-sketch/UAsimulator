import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EnterpriseCategory } from "@/generated/prisma/client";

export async function GET(req: NextRequest) { return POST(req); }

export async function POST(_req: NextRequest) {
  const results: string[] = [];

  try {
    // ── КАТЕГОРІЯ ──────────────────────────────────────────────────────────────
    const cats = [
      { id: "cat-fuel", name: "Паливо та нафтопродукти", icon: "⛽" },
    ];
    for (const c of cats) {
      await prisma.productCategory.upsert({ where: { id: c.id }, update: {}, create: c });
    }
    results.push(`categories: ${cats.length}`);

    // ── СИРОВИНА ───────────────────────────────────────────────────────────────
    const rawMaterials = [
      {
        id: "prod-crude-oil",        categoryId: "cat-fuel",
        name: "Сира нафта",          unit: "бар",
        basePrice: 800,              priceElasticity: 1.2,  demandCoefficient: 0.001,
        isRawMaterial: true,         icon: "🛢️",
      },
      {
        id: "prod-natural-gas-raw",  categoryId: "cat-fuel",
        name: "Природний газ",       unit: "м³",
        basePrice: 12,               priceElasticity: 1.0,  demandCoefficient: 0.002,
        isRawMaterial: true,         icon: "💨",
      },
    ];
    for (const p of rawMaterials) {
      await prisma.product.upsert({ where: { id: p.id }, update: {}, create: p });
    }
    results.push(`raw materials: ${rawMaterials.length}`);

    // ── ГОТОВІ ПРОДУКТИ ────────────────────────────────────────────────────────
    const processedProducts = [
      {
        id: "prod-petrol-92",       categoryId: "cat-fuel",
        name: "Бензин А-92",        unit: "л",
        basePrice: 48,              priceElasticity: 0.8,  demandCoefficient: 0.006,
        isRawMaterial: false,       icon: "⛽",
      },
      {
        id: "prod-petrol-95",       categoryId: "cat-fuel",
        name: "Бензин А-95",        unit: "л",
        basePrice: 56,              priceElasticity: 0.9,  demandCoefficient: 0.005,
        isRawMaterial: false,       icon: "⛽",
      },
      {
        id: "prod-petrol-98",       categoryId: "cat-fuel",
        name: "Бензин А-98 Premium",unit: "л",
        basePrice: 68,              priceElasticity: 1.2,  demandCoefficient: 0.002,
        isRawMaterial: false,       icon: "⛽",
      },
      {
        id: "prod-diesel",          categoryId: "cat-fuel",
        name: "Дизельне паливо",    unit: "л",
        basePrice: 45,              priceElasticity: 0.8,  demandCoefficient: 0.007,
        isRawMaterial: false,       icon: "🚛",
      },
      {
        id: "prod-lpg",             categoryId: "cat-fuel",
        name: "Скраплений газ LPG", unit: "л",
        basePrice: 28,              priceElasticity: 0.9,  demandCoefficient: 0.004,
        isRawMaterial: false,       icon: "🔥",
      },
      {
        id: "prod-kerosene",        categoryId: "cat-fuel",
        name: "Авіагас (гас)",      unit: "л",
        basePrice: 62,              priceElasticity: 1.1,  demandCoefficient: 0.001,
        isRawMaterial: false,       icon: "✈️",
      },
      {
        id: "prod-engine-oil",      categoryId: "cat-fuel",
        name: "Моторна олива",      unit: "л",
        basePrice: 250,             priceElasticity: 1.3,  demandCoefficient: 0.002,
        isRawMaterial: false,       icon: "🛢️",
      },
      {
        id: "prod-bitumen",         categoryId: "cat-fuel",
        name: "Бітум дорожній",     unit: "кг",
        basePrice: 80,              priceElasticity: 1.0,  demandCoefficient: 0.001,
        isRawMaterial: false,       icon: "🏗️",
      },
    ];
    for (const p of processedProducts) {
      await prisma.product.upsert({ where: { id: p.id }, update: {}, create: p });
    }
    results.push(`processed products: ${processedProducts.length}`);

    // ── ТИПИ ПІДПРИЄМСТВ ──────────────────────────────────────────────────────
    const enterpriseTypes = [
      // EXTRACTION
      {
        id: "etype-oil-well",     name: "Нафтова свердловина",
        category: EnterpriseCategory.EXTRACTION,
        icon: "🛢️",              baseCapacity: 500,
        workersPerUnit: 5,        baseRentPerTick: 800,
      },
      {
        id: "etype-gas-well",     name: "Газова свердловина",
        category: EnterpriseCategory.EXTRACTION,
        icon: "💨",              baseCapacity: 50000,
        workersPerUnit: 3,        baseRentPerTick: 500,
      },
      // PRODUCTION
      {
        id: "etype-oil-refinery", name: "Нафтопереробний завод (НПЗ)",
        category: EnterpriseCategory.PRODUCTION,
        icon: "🏭",              baseCapacity: 200,
        workersPerUnit: 15,       baseRentPerTick: 1500,
      },
      // TRADE
      {
        id: "etype-gas-station",  name: "Автозаправна станція (АЗС)",
        category: EnterpriseCategory.TRADE,
        icon: "⛽",              baseCapacity: 300,
        workersPerUnit: 3,        baseRentPerTick: 400,
      },
    ];
    for (const t of enterpriseTypes) {
      await prisma.enterpriseType.upsert({ where: { id: t.id }, update: {}, create: t });
    }
    results.push(`enterprise types: ${enterpriseTypes.length}`);

    // ── РЕЦЕПТИ ───────────────────────────────────────────────────────────────
    // 1 бар. нафти (159 л) → різні фракції залежно від рецепту НПЗ.
    // Гравець вибирає ЯКУ фракцію переганяти, купуючи відповідний рецепт.
    const recipes = [
      // ─── Видобуток ────────────────────────────────────────────────────────
      {
        id: "recipe-crude-oil",
        name: "Видобуток сирої нафти",
        outputProductId: "prod-crude-oil",
        outputAmount: 1,
        enterpriseTypeId: "etype-oil-well",
        category: EnterpriseCategory.EXTRACTION,
        inputs: [],
      },
      {
        id: "recipe-natural-gas",
        name: "Видобуток природного газу",
        outputProductId: "prod-natural-gas-raw",
        outputAmount: 1,
        enterpriseTypeId: "etype-gas-well",
        category: EnterpriseCategory.EXTRACTION,
        inputs: [],
      },
      // ─── НПЗ (PRODUCTION) — кожен рецепт = одна фракція ──────────────────
      {
        id: "recipe-refine-petrol92",
        name: "Перегонка → Бензин А-92",
        outputProductId: "prod-petrol-92",
        outputAmount: 80,           // л з 1 барр. нафти
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-petrol95",
        name: "Перегонка → Бензин А-95",
        outputProductId: "prod-petrol-95",
        outputAmount: 60,
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-petrol98",
        name: "Перегонка → Бензин А-98",
        outputProductId: "prod-petrol-98",
        outputAmount: 40,
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-diesel",
        name: "Перегонка → Дизельне паливо",
        outputProductId: "prod-diesel",
        outputAmount: 100,          // дизель — найбільший вихід
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-lpg",
        name: "Перегонка → LPG (скраплений газ)",
        outputProductId: "prod-lpg",
        outputAmount: 50,
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-kerosene",
        name: "Перегонка → Авіагас",
        outputProductId: "prod-kerosene",
        outputAmount: 40,
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-engine-oil",
        name: "Виробництво моторної оливи",
        outputProductId: "prod-engine-oil",
        outputAmount: 30,
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
      {
        id: "recipe-refine-bitumen",
        name: "Виробництво бітуму (залишок)",
        outputProductId: "prod-bitumen",
        outputAmount: 120,
        enterpriseTypeId: "etype-oil-refinery",
        category: EnterpriseCategory.PRODUCTION,
        inputs: [{ productId: "prod-crude-oil", amount: 1 }],
      },
    ];

    let recipesCreated = 0;
    for (const r of recipes) {
      const { inputs, category, ...recipeData } = r;
      const existing = await prisma.productionRecipe.findUnique({ where: { id: r.id } });
      if (!existing) {
        await prisma.productionRecipe.create({
          data: {
            ...recipeData,
            enterpriseCategory: category,
            inputs: { create: inputs },
          },
        });
        recipesCreated++;
      }
    }
    results.push(`recipes created: ${recipesCreated} (${recipes.length - recipesCreated} already existed)`);

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), results }, { status: 500 });
  }
}
