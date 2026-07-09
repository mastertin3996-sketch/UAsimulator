"use client";

import type { EnterpriseData } from "@/components/game/EnterpriseDetailClient";
import { productEmoji } from "@/components/game/EnterpriseDetailClient";

// ── Дзеркалить ProductionService.ts (TEXTILE_FACTORY branch) та MarketService.ts
// (textileQualityMult). Суто читання на клієнті — набори SKU продубльовано тут,
// тримати в синхроні, якщо оригінали зміняться.
const TEXTILE_FABRIC_SKUS  = new Set(["SF-FABRIC", "SF-YARN", "SF-LINEN", "SF-DENIM", "SF-THREAD"]);
const TEXTILE_GARMENT_SKUS = new Set(["FG-CLOTHING", "FG-KNITWEAR", "FG-JEANS", "FG-BEDDING", "FG-WORKWEAR", "FG-CARPET"]);
// TEXTILE_FG_SKUS — родина готових товарів, що отримують ринкову премію (MarketService.ts)
const TEXTILE_FG_SKUS = new Set(["FG-CLOTHING", "FG-KNITWEAR", "FG-JEANS", "FG-BEDDING", "FG-WORKWEAR", "FG-CARPET"]);
const QUALITY_PREMIUM_THRESHOLD = 8;
const QUALITY_PREMIUM_MULT = 1.15; // NPC платить +15% за avgQuality ≥ 8

interface ProfileLine { profession: string; label: string; note: string }
const PROFESSIONS: ProfileLine[] = [
  { profession: "SPINNER",        label: "Прядильник", note: "+5%/особу (до 3) на тканину/пряжу" },
  { profession: "WEAVER",         label: "Ткач",        note: "+5%/особу (до 3) на SF-FABRIC" },
  { profession: "GARMENT_WORKER", label: "Швачка",      note: "+5%/особу (до 3) на готовий одяг" },
  { profession: "TAILOR",         label: "Кравець",     note: "+5%/особу (до 3) на одяг/трикотаж" },
  { profession: "DYER",           label: "Фарбувальник", note: "+0.4 якості/особу (до 3) на тканину й одяг" },
];

interface EquipLine { sku: string; label: string; note: string }
const EQUIPMENT: EquipLine[] = [
  { sku: "EQ-SPINNINGMILL", label: "Прядильний verstat", note: "+20% на тканину/пряжу (або EQ-LOOM)" },
  { sku: "EQ-LOOM",          label: "Ткацький верстат",   note: "+20% на тканину/пряжу (або EQ-SPINNINGMILL)" },
  { sku: "EQ-KNITMACHINE",   label: "В'язальна машина",   note: "+20% лише на FG-KNITWEAR" },
  { sku: "EQ-SEWINGLINE",    label: "Швейна лінія",       note: "+20% на готовий одяг" },
  { sku: "EQ-DYEINGVAT",     label: "Фарбувальна ванна",  note: "+0.6 якості на тканину й одяг (з DYER)" },
];

function qualityColor(q: number): string {
  if (q >= QUALITY_PREMIUM_THRESHOLD) return "text-emerald-400";
  if (q >= 6) return "text-gray-300";
  return "text-amber-400";
}

export default function TextileTab({ enterprise }: { enterprise: EnterpriseData }) {
  const workingEquipmentSkus = new Set<string>();
  for (const w of enterprise.workshops) {
    for (const eq of w.equipment) {
      if (!eq.isBroken && eq.wearAndTear < 1.0 && eq.sku) workingEquipmentSkus.add(eq.sku);
    }
  }
  const activeEmployees = enterprise.employees.filter(e => !e.isOnStrike);
  const dyers = activeEmployees.filter(e => e.profession === "DYER").length;
  const hasVat = workingEquipmentSkus.has("EQ-DYEINGVAT");
  const dyerBonus = Math.min(dyers, 3) * 0.4 + (hasVat ? 0.6 : 0);

  const fgItems = enterprise.inventory.filter(
    inv => TEXTILE_FG_SKUS.has(inv.product.sku) && inv.quantity > 0.001,
  );
  const fabricItems = enterprise.inventory.filter(
    inv => TEXTILE_FABRIC_SKUS.has(inv.product.sku) && inv.quantity > 0.001,
  );

  return (
    <div className="space-y-4 p-1">
      {/* Профільний персонал */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Персонал цеху</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {PROFESSIONS.map(p => {
            const count = activeEmployees.filter(e => e.profession === p.profession).length;
            return (
              <div key={p.profession} className={`rounded px-2 py-1.5 ${count > 0 ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                {count > 0 ? "✓" : "✗"} {p.label}: {count}
                <span className="block text-gray-600 normal-case">{p.note}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Профільна техніка */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Профільна техніка</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {EQUIPMENT.map(e => {
            const has = workingEquipmentSkus.has(e.sku);
            return (
              <div key={e.sku} className={`rounded px-2 py-1.5 ${has ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                {has ? "✓" : "✗"} {e.label} ({e.sku})
                <span className="block text-gray-600 normal-case">{e.note}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* DYER quality premium mechanic */}
      <div className={`rounded-lg border p-3 space-y-2 ${dyerBonus > 0 ? "border-emerald-800/40 bg-emerald-950/10" : "border-gray-800 bg-gray-900"}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Бонус якості від фарбування</p>
          <span className={`text-sm font-bold ${dyerBonus > 0 ? "text-emerald-400" : "text-gray-500"}`}>
            {dyerBonus > 0 ? `+${dyerBonus.toFixed(1)} якості` : "Немає"}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Якщо середня якість готового текстилю (FG-CLOTHING, FG-KNITWEAR, FG-JEANS, FG-BEDDING, FG-WORKWEAR, FG-CARPET)
          сягає {QUALITY_PREMIUM_THRESHOLD}/10 і вище — NPC-ринок платить ×{QUALITY_PREMIUM_MULT.toFixed(2)} (+{Math.round((QUALITY_PREMIUM_MULT - 1) * 100)}%) за продаж.
        </p>

        {(fabricItems.length > 0 || fgItems.length > 0) && (
          <div className="space-y-1.5 pt-1">
            {[...fabricItems, ...fgItems].map(inv => {
              const overThreshold = inv.quality >= QUALITY_PREMIUM_THRESHOLD;
              return (
                <div key={inv.product.sku} className="flex items-center justify-between gap-2 text-xs rounded bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-300 flex items-center gap-1.5 min-w-0">
                    <span>{productEmoji(inv.product.sku)}</span>
                    <span className="truncate">{inv.product.nameUa}</span>
                    <span className="text-gray-600 shrink-0">{inv.quantity.toFixed(0)} {inv.product.unit}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-mono font-semibold ${qualityColor(inv.quality)}`}>{inv.quality.toFixed(1)}/10</span>
                    {TEXTILE_FG_SKUS.has(inv.product.sku) && (
                      overThreshold
                        ? <span className="text-emerald-400">✓ преміум активна</span>
                        : <span className="text-gray-600">нижче порогу</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {fabricItems.length === 0 && fgItems.length === 0 && (
          <p className="text-xs text-gray-600">Немає тканини чи готового текстилю на складі підприємства.</p>
        )}
      </div>
    </div>
  );
}
