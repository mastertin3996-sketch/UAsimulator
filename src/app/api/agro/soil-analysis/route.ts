import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NPK_RECCOMEND: Record<string, { n: string; p: string; k: string; note: string }> = {
  'RM-WHEAT':   { n: 'висока',   p: 'середня',  k: 'низька',   note: 'Пшениця потребує азоту на початку росту' },
  'RM-SUNFL':   { n: 'середня',  p: 'середня',  k: 'висока',   note: 'Соняшник виснажує калій' },
  'RM-SUGBEET': { n: 'середня',  p: 'середня',  k: 'дуже висока', note: 'Буряк — найбільший споживач калію' },
  'RM-CORN':    { n: 'дуже висока', p: 'середня', k: 'середня', note: 'Кукурудза — азотофаг №1' },
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { searchParams } = new URL(req.url);
  const enterpriseId = searchParams.get("enterpriseId");
  if (!enterpriseId) return NextResponse.json({ error: "enterpriseId required" }, { status: 400 });

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId, type: "AGRO_FARM", isOperational: true },
    select: {
      id: true, name: true, footprintM2: true,
      localWeatherMod: true, localWeatherDesc: true,
      landPlot: {
        select: {
          soilQuality: true, lastCropSku: true, fertilizerTicksLeft: true,
          pestDamageMult: true, cropDiseaseType: true, cropDiseaseSeverity: true,
          nitrogenLevel: true, phosphorusLevel: true, potassiumLevel: true,
          moistureLevel: true, grainQualityClass: true, fieldOpsMask: true,
        },
      },
      workshops: {
        where:  { isActive: true },
        select: {
          grainMoisturePct: true, plantedSeasonTick: true, harvestAccumulated: true,
          productionOrders: {
            where:  { status: 'IN_PROGRESS' },
            select: { recipe: { select: { outputs: { select: { product: { select: { sku: true, nameUa: true } } } } } } },
          },
        },
        take: 1,
      },
    },
  });

  if (!enterprise?.landPlot) return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });

  const lp  = enterprise.landPlot;
  const ws  = enterprise.workshops[0];
  const cropSku = ws?.productionOrders[0]?.recipe?.outputs?.[0]?.product?.sku ?? lp.lastCropSku ?? null;
  const cropName = ws?.productionOrders[0]?.recipe?.outputs?.[0]?.product?.nameUa ?? null;

  const n = lp.nitrogenLevel ?? 70;
  const p = lp.phosphorusLevel ?? 70;
  const k = lp.potassiumLevel ?? 70;
  const moisture = lp.moistureLevel ?? 60;
  const avgNPK = (n + p + k) / 3;

  // Recommendations
  const warnings: string[] = [];
  if (n < 40)       warnings.push(`⚠ Азот критично низький (${n.toFixed(0)}%) — потрібне азотне добриво`);
  if (p < 40)       warnings.push(`⚠ Фосфор низький (${p.toFixed(0)}%) — внесіть компост або подвійний суперфосфат`);
  if (k < 40)       warnings.push(`⚠ Калій низький (${k.toFixed(0)}%) — калійне добриво або компост`);
  if (moisture < 30) warnings.push(`🌵 Критична посуха (${moisture.toFixed(0)}%) — зрошення або дощування`);
  if (moisture > 80) warnings.push(`🌊 Перезволоження (${moisture.toFixed(0)}%) — дренаж`);
  if ((lp.soilQuality ?? 5) < 4) warnings.push(`⬇ Деградація ґрунту (${lp.soilQuality}/10) — органічне добриво і ротація`);
  if ((lp.cropDiseaseSeverity ?? 0) > 0.3) warnings.push(`🦠 Хвороба посівів (${((lp.cropDiseaseSeverity ?? 0) * 100).toFixed(0)}%) — пестицид`);

  const suggestions: string[] = [];
  if (avgNPK < 60) suggestions.push('Внесіть концентрат AG-FERTILIZER для відновлення NPK');
  if (avgNPK < 45) suggestions.push('Компост SF-COMPOST відновлює N+10/P+12/K+15 і покращує ґрунт');
  if (cropSku && NPK_RECCOMEND[cropSku]) {
    const rec = NPK_RECCOMEND[cropSku];
    suggestions.push(`Для ${cropName ?? cropSku}: потреба N=${rec.n}, P=${rec.p}, K=${rec.k}. ${rec.note}`);
  }
  if ((ws?.grainMoisturePct ?? 14) > 17) {
    suggestions.push(`Зерно вологе (${(ws?.grainMoisturePct ?? 14).toFixed(1)}%) — просушіть до 14%`);
  }

  // Yield efficiency estimate
  const npkEff = Math.min(1.35, (1 + (n/100)*0.15) * (1 + (p/100)*0.10) * (1 + (k/100)*0.10));
  const moistEff = moisture < 20 ? 0.5 : moisture < 35 ? 0.7 : moisture <= 75 ? 0.97 : 0.85;
  const soilEff = Math.min(1.5, (lp.soilQuality ?? 5) / 8);
  const totalEff = Math.min(2.0, npkEff * moistEff * soilEff);

  return NextResponse.json({
    enterpriseId,
    name: enterprise.name,
    activeCrop: cropSku,
    activeCropName: cropName,
    npk: {
      nitrogen:   { level: n,  status: n < 40 ? 'critical' : n < 60 ? 'low' : 'ok' },
      phosphorus: { level: p,  status: p < 40 ? 'critical' : p < 60 ? 'low' : 'ok' },
      potassium:  { level: k,  status: k < 40 ? 'critical' : k < 60 ? 'low' : 'ok' },
      average:    avgNPK,
    },
    moisture:   { level: moisture, status: moisture < 30 ? 'drought' : moisture > 80 ? 'flooded' : 'ok' },
    soil:       { quality: lp.soilQuality ?? 5, fertility: soilEff },
    grainQualityClass: lp.grainQualityClass ?? 2,
    grain: {
      moisturePct:   ws?.grainMoisturePct ?? 14,
      accumulated:   ws?.harvestAccumulated ?? 0,
      qualityClass:  lp.grainQualityClass ?? 2,
      qualityLabel:  lp.grainQualityClass === 1 ? 'Клас 1 — Преміум' : lp.grainQualityClass === 3 ? 'Клас 3 — Фураж' : 'Клас 2 — Стандарт',
    },
    disease:    { type: lp.cropDiseaseType, severity: lp.cropDiseaseSeverity ?? 0 },
    weather:    { mod: enterprise.localWeatherMod ?? 1.0, desc: enterprise.localWeatherDesc },
    estimatedYieldEfficiency: totalEff,
    warnings,
    suggestions,
  });
}
