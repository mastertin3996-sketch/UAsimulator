/**
 * seed-industrial — нові категорії та продукти (тільки те, чого немає в seed.ts та seed-products).
 * Виконуй: GET/POST /api/admin/seed-industrial
 * Ідемпотентний (upsert по id, update: {} → не перезаписує).
 *
 * Ціни-джерела:
 *  - Алюміній: Укрпромпостач, MetInvest 2026  (~120 UAH/кг профіль)
 *  - Мідний кабель: Nexans, Кабельний завод Київ 2026  (~42 UAH/м 2.5мм²)
 *  - Цемент: Кривий Ріг Цемент, Heidelberg Materials UA 2026  (~155 UAH/мішок 25кг)
 *  - Кава: Якобс Монарх 250г Варус 2026  (~120 UAH/пач)
 *  - Смартфон: Xiaomi Redmi 14C 128GB Rozetka 2026  (~5 400 UAH)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) { return POST(req); }

export async function POST(_req: NextRequest) {
  const results: string[] = [];

  try {
    // ── НОВІ КАТЕГОРІЇ ─────────────────────────────────────────────────────────
    const newCats = [
      { id: "cat-industrial",  name: "Промислові матеріали", icon: "🏗️" },
      { id: "cat-electronics", name: "Електроніка",          icon: "📱" },
    ];
    for (const c of newCats) {
      await prisma.productCategory.upsert({ where: { id: c.id }, update: {}, create: c });
    }
    results.push(`categories: ${newCats.length}`);

    // ── НОВІ ПРОДУКТИ (не існують в seed.ts або seed-products) ─────────────────
    const products = [
      // ── Металургія (cat-industrial) ────────────────────────────────────────
      {
        id: "prod-aluminum",        categoryId: "cat-industrial",
        name: "Алюміній (профіль)", unit: "кг",
        // UAH ref: ~120 UAH/кг → 80 GC/кг base → NPC: 120 GC/кг
        basePrice: 80,              priceElasticity: 1.3,  demandCoefficient: 0.001,
        isRawMaterial: false,       icon: "🪙",
      },
      {
        id: "prod-copper-wire",     categoryId: "cat-industrial",
        name: "Мідний кабель",      unit: "м",
        // UAH ref: ~42 UAH/м (ПВС 2×2.5мм²) → 28 GC/м base → NPC: 42 GC/м
        basePrice: 28,              priceElasticity: 1.4,  demandCoefficient: 0.001,
        isRawMaterial: false,       icon: "🔌",
      },
      {
        id: "prod-cement",          categoryId: "cat-industrial",
        name: "Цемент (25кг)",      unit: "мішок",
        // UAH ref: ~155 UAH/мішок → 103 GC/мішок base → NPC: 155 GC
        basePrice: 103,             priceElasticity: 1.1,  demandCoefficient: 0.002,
        isRawMaterial: false,       icon: "🪨",
      },
      // ── FMCG — Кава (cat-food) ────────────────────────────────────────────
      {
        id: "prod-coffee",          categoryId: "cat-food",
        name: "Кава мелена 250г",   unit: "пач",
        // UAH ref: ~120 UAH (Jacobs Monarch, Варус 2026) → 80 GC base → NPC: 120 GC
        basePrice: 80,              priceElasticity: 1.6,  demandCoefficient: 0.003,
        isRawMaterial: false,       icon: "☕",
      },
      // ── Електроніка (cat-electronics) ─────────────────────────────────────
      {
        id: "prod-smartphone",      categoryId: "cat-electronics",
        name: "Смартфон (бюджет)",  unit: "шт",
        // UAH ref: ~5 400 UAH (Xiaomi Redmi 14C 128GB) → 3 600 GC base → NPC: 5 400 GC
        basePrice: 3600,            priceElasticity: 1.8,  demandCoefficient: 0.0005,
        isRawMaterial: false,       icon: "📱",
      },
    ];

    for (const p of products) {
      await prisma.product.upsert({ where: { id: p.id }, update: {}, create: p });
    }
    results.push(`products: ${products.length}`);

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), results }, { status: 500 });
  }
}
