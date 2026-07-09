"use client";

import type { EnterpriseData } from "@/components/game/EnterpriseDetailClient";
import { productEmoji } from "@/components/game/EnterpriseDetailClient";

// ── Дзеркалить FoodProcessingService (src/engine/FoodProcessingService.ts) ──
// Суто читання на клієнті: FoodProcessingService.ts має серверну залежність
// (PrismaClient), тому в "use client" компонент його імпортувати не можна —
// набори SKU продубльовано тут. ВАЖЛИВО: тримати в синхроні зі значеннями
// в FoodProcessingService, якщо вони зміняться там — оновити і тут.
const PERISHABLE_SKUS = new Set<string>([
  "FG-MILK", "FG-YOGURT", "FG-SOURCREAM", "FG-CHEESE", "FG-BUTTER", "FG-CONDENSED-MILK",
  "FG-BREAD", "FG-CAKE", "FG-COOKIES",
  "FG-MEAT", "FG-SAUSAGE", "FG-BEEF", "FG-PORK", "FG-CHICKEN", "FG-DUMPLINGS",
]);
const COLD_CHAIN_SKUS = new Set<string>(["EQ-REFRIGERATOR-IND", "EQ-CLIMATE", "EQ-COLDROOM"]);
const DECAY_PER_TICK = 0.04;
const QUALITY_FLOOR = 3.0;
const WARN_QUALITY_THRESHOLD = 6.0;

// Дзеркалить ProductionService (Wave 1) — родини SKU виходу для профільних технік.
const FOOD_BAKE_SKUS  = new Set(["FG-BREAD", "FG-PASTA", "FG-CAKE", "FG-COOKIES", "FG-DUMPLINGS"]);
const FOOD_MEAT_SKUS  = new Set(["FG-MEAT", "FG-SAUSAGE", "FG-BEEF", "FG-PORK", "FG-CHICKEN", "FG-CANNED-MEAT"]);
const FOOD_DAIRY_SKUS = new Set(["FG-CHEESE", "FG-BUTTER", "FG-CONDENSED-MILK", "FG-MILK", "FG-YOGURT", "FG-SOURCREAM"]);
const FOOD_LIQUID_SKUS = new Set(["FG-MILK", "FG-SUNOIL", "FG-YOGURT", "FG-SOURCREAM", "FG-BEER", "FG-SPIRITS", "FG-CORN-SYRUP", "FG-MAYO"]);

interface ProfileLine { profession: string; label: string; eqSku: string; eqLabel: string; skus: Set<string>; bonusPct: number }
const PROFILE_LINES: ProfileLine[] = [
  { profession: "MILLER",      label: "Мірошник",  eqSku: "", eqLabel: "", skus: new Set(), bonusPct: 0 },
  { profession: "BAKER",       label: "Пекар",      eqSku: "EQ-BAKELINE", eqLabel: "Лінія випічки",  skus: FOOD_BAKE_SKUS,  bonusPct: 25 },
  { profession: "BUTCHER",     label: "М'ясник",    eqSku: "EQ-MEATLINE", eqLabel: "М'ясна лінія",   skus: FOOD_MEAT_SKUS,  bonusPct: 25 },
  { profession: "CHEESEMAKER", label: "Сировар",    eqSku: "EQ-CHEESEVAT", eqLabel: "Сирна ванна",  skus: FOOD_DAIRY_SKUS, bonusPct: 20 },
  { profession: "BREWER",      label: "Пивовар",    eqSku: "EQ-BOTTLING", eqLabel: "Лінія розливу", skus: FOOD_LIQUID_SKUS, bonusPct: 15 },
];

function qualityColor(q: number): string {
  if (q <= QUALITY_FLOOR + 0.01) return "text-red-400";
  if (q < WARN_QUALITY_THRESHOLD) return "text-amber-400";
  return "text-emerald-400";
}

export default function FoodProcessingTab({ enterprise }: { enterprise: EnterpriseData }) {
  const workingEquipmentSkus = new Set<string>();
  for (const w of enterprise.workshops) {
    for (const eq of w.equipment) {
      if (!eq.isBroken && eq.wearAndTear < 1.0 && eq.sku) workingEquipmentSkus.add(eq.sku);
    }
  }
  const hasColdChain = [...COLD_CHAIN_SKUS].some(sku => workingEquipmentSkus.has(sku));

  const perishableItems = enterprise.inventory.filter(
    inv => PERISHABLE_SKUS.has(inv.product.sku) && inv.quantity > 0.001,
  );

  const activeEmployees = enterprise.employees.filter(e => !e.isOnStrike);

  return (
    <div className="space-y-4 p-1">
      {/* Cold-chain status */}
      <div className={`rounded-lg border p-3 space-y-2 ${hasColdChain ? "border-emerald-800/40 bg-emerald-950/10" : "border-red-800/40 bg-red-950/10"}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Холодовий ланцюг</p>
          <span className={`text-sm font-bold ${hasColdChain ? "text-emerald-400" : "text-red-400"}`}>
            {hasColdChain ? "✓ Активний" : "✗ Відсутній"}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Потрібна робоча (не зламана, не зношена) одиниця: EQ-REFRIGERATOR-IND / EQ-CLIMATE / EQ-COLDROOM.
        </p>
        {!hasColdChain && (
          <p className="text-xs text-red-400">
            Без холоду псувні товари втрачають {DECAY_PER_TICK.toFixed(2)} якості/тік (не нижче {QUALITY_FLOOR.toFixed(1)}/10).
          </p>
        )}
      </div>

      {/* Perishable inventory */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Псувні запаси</p>
        {perishableItems.length === 0 ? (
          <p className="text-xs text-gray-600">Немає псувних товарів на складі підприємства.</p>
        ) : (
          <div className="space-y-1.5">
            {perishableItems.map(inv => {
              const isWarn = inv.quality < WARN_QUALITY_THRESHOLD;
              const isFloor = inv.quality <= QUALITY_FLOOR + 0.01;
              return (
                <div key={inv.product.sku} className="flex items-center justify-between gap-2 text-xs rounded bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-300 flex items-center gap-1.5 min-w-0">
                    <span>{productEmoji(inv.product.sku)}</span>
                    <span className="truncate">{inv.product.nameUa}</span>
                    <span className="text-gray-600 shrink-0">{inv.quantity.toFixed(0)} {inv.product.unit}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-mono font-semibold ${qualityColor(inv.quality)}`}>{inv.quality.toFixed(1)}/10</span>
                    {!hasColdChain && (
                      <span className={isFloor ? "text-red-400" : isWarn ? "text-amber-400" : "text-gray-600"}>
                        {isFloor ? "⚠ на межі псування" : "▼ псується"}
                      </span>
                    )}
                    {hasColdChain && <span className="text-emerald-500">✓ стабільно</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Профільний персонал / техніка */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Що прискорює виробництво</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {PROFILE_LINES.map(line => {
            const count = activeEmployees.filter(e => e.profession === line.profession).length;
            return (
              <div key={line.profession} className={`rounded px-2 py-1.5 ${count > 0 ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                {count > 0 ? "✓" : "✗"} {line.label}: {count}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {PROFILE_LINES.filter(l => l.eqSku).map(line => {
            const has = workingEquipmentSkus.has(line.eqSku);
            return (
              <div key={line.eqSku} className={`rounded px-2 py-1.5 ${has ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                {has ? "✓" : "✗"} {line.eqLabel} ({line.eqSku}) · +{line.bonusPct}%
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-600">
          Мірошник (MILLER) множить продуктивність борошна/цукру/крохмалю без окремої техніки. Решта професій потребують і кваліфікованого персоналу, і робочу профільну лінію одночасно для повного бонусу.
        </p>
      </div>
    </div>
  );
}
