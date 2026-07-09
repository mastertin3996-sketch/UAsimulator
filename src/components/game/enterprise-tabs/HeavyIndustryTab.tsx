"use client";

import type { EnterpriseData } from "@/components/game/EnterpriseDetailClient";

// Дзеркалить ProductionService.HEAVY_RAW_STEEL_SKUS / HEAVY_RAW_WOOD_SKUS — суто читання.
const HEAVY_RAW_SKUS: { sku: string; label: string }[] = [
  { sku: "RM-IRONORE", label: "Залізна руда" },
  { sku: "RM-COAL",     label: "Вугілля" },
  { sku: "RM-LUMBER",   label: "Деревина" },
];

// Дзеркалить heavyInputBonus поріг у ProductionService.ts (avgQuality > 7 → бонус до якості виходу).
const RAW_QUALITY_BASELINE = 7;

export default function HeavyIndustryTab({ enterprise }: { enterprise: EnterpriseData }) {
  const steelworkers = enterprise.employees.filter(e => !e.isOnStrike && e.profession === "STEELWORKER").length;
  const carpenters   = enterprise.employees.filter(e => !e.isOnStrike && e.profession === "CARPENTER").length;

  const hasEquipment = (sku: string) =>
    enterprise.workshops.some(w => w.equipment.some(eq => eq.sku === sku && !eq.isBroken && eq.wearAndTear < 1.0));

  const hasBlastfurnace = hasEquipment("EQ-BLASTFURNACE");
  const hasWoodplaner   = hasEquipment("EQ-WOODPLANER");

  const rawRows = HEAVY_RAW_SKUS.map(raw => {
    const inv = enterprise.inventory.find(i => i.product.sku === raw.sku);
    return { ...raw, quantity: inv?.quantity ?? 0, quality: inv?.quality ?? null };
  });

  return (
    <div className="space-y-4 p-1">
      {/* Raw-material quality → output quality */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Якість сировини → якість продукції</p>
        <p className="text-xs text-gray-600">
          Вища середня якість руди, вугілля та деревини в інвентарі підвищує якість готової сталі й пиломатеріалів.
          Бонус з&apos;являється лише за якості вище ринкової норми (~{RAW_QUALITY_BASELINE.toFixed(0)}) — типова
          сировина дає той самий результат, що й раніше.
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs">
          {rawRows.map(row => {
            const hasStock  = row.quantity > 0.001;
            const isPremium = hasStock && row.quality !== null && row.quality > RAW_QUALITY_BASELINE;
            return (
              <div
                key={row.sku}
                className={`flex items-center justify-between rounded px-2 py-1.5 ${
                  !hasStock ? "bg-gray-800 text-gray-500" : isPremium ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-300"
                }`}
              >
                <span>{row.label} ({row.sku})</span>
                <span className="font-mono">
                  {hasStock
                    ? `${row.quantity.toLocaleString("uk-UA")} · якість ${row.quality!.toFixed(1)}${isPremium ? " ✓ бонус" : ""}`
                    : "немає в наявності"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staffing + equipment checklist */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Що підвищує виробництво</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded px-2 py-1.5 ${steelworkers > 0 ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
            {steelworkers > 0 ? "✓" : "✗"} Сталевари: {steelworkers} (+{Math.min(steelworkers, 3) * 5}% сталь)
          </div>
          <div className={`rounded px-2 py-1.5 ${carpenters > 0 ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
            {carpenters > 0 ? "✓" : "✗"} Теслярі: {carpenters} (+{Math.min(carpenters, 3) * 5}% деревина)
          </div>
          <div className={`rounded px-2 py-1.5 ${hasBlastfurnace ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
            {hasBlastfurnace ? "✓" : "✗"} EQ-BLASTFURNACE (+20% сталь)
          </div>
          <div className={`rounded px-2 py-1.5 ${hasWoodplaner ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
            {hasWoodplaner ? "✓" : "✗"} EQ-WOODPLANER (+20% деревина)
          </div>
        </div>
        {steelworkers === 0 && carpenters === 0 && !hasBlastfurnace && !hasWoodplaner && (
          <p className="text-xs text-gray-600">Немає профільного персоналу чи техніки — цех працює на базовій потужності.</p>
        )}
      </div>
    </div>
  );
}
