"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Warehouse, Package, ChevronDown, ChevronRight,
  Search, Building2, TrendingUp,
} from "lucide-react";
import { QualityBar } from "@/components/game/QualityBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types (as per API spec) ──────────────────────────────────────────────

interface InventoryItem {
  quantity          : number;
  avgQuality        : number;
  autoSellThreshold : number | null;
  autoSellPriceUah  : number | null;
  product           : { id: string; nameUa: string; unit: string };
}

interface EnterpriseData {
  id       : string;
  name     : string;
  type     : string;
  city     : string;          // city name (nameUa from real API response)
  inventory: InventoryItem[];
}

interface WarehouseData {
  id          : string;
  maxVolumeM3 : number;
  usedVolumeM3: number;
  enterprise  : { name: string };
}

// Real API may return warehouses as Record<id, obj> — we normalise below.
interface ApiResponse {
  enterprises : EnterpriseData[];
  warehouses  : WarehouseData[] | Record<string, Omit<WarehouseData, "id"> & { id?: string; name?: string; cityName?: string; capacity?: number; usedCapacity?: number }>;
  basePriceMap?: Record<string, number>;
  summary?    : { productId: string; basePrice: number }[];
}

// ─── Enterprise type icons ────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  AGRO_FARM       : "🌾",
  FOOD_PROCESSING : "🏭",
  RETAIL_STORE    : "🏪",
  TEXTILE_FACTORY : "🧵",
  OFFICE          : "🏢",
  WAREHOUSE       : "📦",
  RD_LABORATORY   : "🔬",
  LOGISTICS_HUB   : "🚛",
};

function enterpriseIcon(type: string): string {
  return TYPE_ICON[type] ?? "🏭";
}

// ─── Normalise the API response ───────────────────────────────────────────
//
// Real /api/warehouses returns:
//   - enterprises with cityName (inside items it's mapped differently)
//   - warehouses as Record<id, WareGroup> (not array)
//   - summary[] instead of basePriceMap
//
// We normalise everything here so the rest of the component uses a clean shape.

interface Normalised {
  enterprises : EnterpriseData[];
  warehouses  : WarehouseData[];
  basePriceMap: Record<string, number>;
}

function normalise(raw: ApiResponse): Normalised {
  // basePriceMap: prefer explicit key, fall back to deriving from summary[]
  let basePriceMap: Record<string, number> = raw.basePriceMap ?? {};
  if (!raw.basePriceMap && raw.summary) {
    for (const s of raw.summary) {
      basePriceMap[s.productId] = s.basePrice;
    }
  }

  // warehouses: accept both array and Record<id, …>
  let warehouses: WarehouseData[];
  if (Array.isArray(raw.warehouses)) {
    warehouses = raw.warehouses as WarehouseData[];
  } else {
    warehouses = Object.entries(raw.warehouses).map(([id, w]) => {
      // Real API WareGroup has capacity/usedCapacity instead of maxVolumeM3/usedVolumeM3
      const ww = w as Record<string, unknown>;
      return {
        id,
        maxVolumeM3 : (ww.maxVolumeM3 ?? ww.capacity ?? 0) as number,
        usedVolumeM3: (ww.usedVolumeM3 ?? ww.usedCapacity ?? 0) as number,
        enterprise  : { name: (ww.name ?? "") as string },
      };
    });
  }

  // enterprises: real API nested cityName inside object, items use productName + basePrice
  // We coerce to EnterpriseData; the "city" field is either already there or needs mapping.
  const enterprises: EnterpriseData[] = (raw.enterprises as unknown as Record<string, unknown>[]).map((e) => {
    const city: string =
      typeof e["city"] === "string"
        ? e["city"]
        : (e["cityName"] as string | undefined) ?? "";

    const inventory: InventoryItem[] = ((e["items"] ?? e["inventory"]) as Record<string, unknown>[] | undefined ?? [])
      .map((i) => ({
        quantity          : (i["quantity"] as number)  ?? 0,
        avgQuality        : (i["quality"]  ?? i["avgQuality"] ?? 0) as number,
        autoSellThreshold : (i["autoSellQty"] ?? i["autoSellThreshold"] ?? null) as number | null,
        autoSellPriceUah  : (i["autoSellPrice"] ?? i["autoSellPriceUah"] ?? null) as number | null,
        product           : {
          id    : (i["productId"]   ?? (i["product"] as Record<string,unknown> | undefined)?.["id"]      ?? "") as string,
          nameUa: (i["productName"] ?? (i["product"] as Record<string,unknown> | undefined)?.["nameUa"]  ?? "") as string,
          unit  : (i["unit"]        ?? (i["product"] as Record<string,unknown> | undefined)?.["unit"]    ?? "") as string,
        },
      }));

    return {
      id       : e["id"] as string,
      name     : e["name"] as string,
      type     : e["type"] as string,
      city,
      inventory,
    };
  });

  return { enterprises, warehouses, basePriceMap };
}

// ─── Warehouse capacity bar ───────────────────────────────────────────────

function WarehouseBar({ wh }: { wh: WarehouseData }) {
  const pct   = wh.maxVolumeM3 > 0 ? (wh.usedVolumeM3 / wh.maxVolumeM3) * 100 : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-violet-500";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Warehouse size={14} className="text-violet-400 shrink-0" />
        <span className="text-sm font-medium text-white truncate">{wh.enterprise.name}</span>
        <span className="text-xs text-gray-600 ml-auto tabular-nums">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-gray-600 font-mono">
        {formatNumber(wh.usedVolumeM3)} / {formatNumber(wh.maxVolumeM3)} м³
      </p>
    </div>
  );
}

// ─── Enterprise card ──────────────────────────────────────────────────────

function EnterpriseCard({
  ent, basePriceMap, search,
}: {
  ent         : EnterpriseData;
  basePriceMap: Record<string, number>;
  search      : string;
}) {
  const [open, setOpen] = useState(true);

  const filteredInventory = useMemo(() => {
    if (!search.trim()) return ent.inventory;
    const q = search.toLowerCase();
    return ent.inventory.filter((i) =>
      i.product.nameUa.toLowerCase().includes(q),
    );
  }, [ent.inventory, search]);

  const totalValue = useMemo(
    () =>
      ent.inventory.reduce((sum, i) => {
        const bp = basePriceMap[i.product.id] ?? 0;
        return sum + i.quantity * bp;
      }, 0),
    [ent.inventory, basePriceMap],
  );

  // Don't render the card at all if search active and nothing matches
  if (search.trim() && filteredInventory.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-800/30 transition-colors text-left"
      >
        <span className="text-xl shrink-0">{enterpriseIcon(ent.type)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{ent.name}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {ent.city} · {ent.inventory.length} позицій
          </p>
        </div>
        {totalValue > 0 && (
          <span className="text-xs font-mono text-amber-400 shrink-0 mr-2">
            {formatNumber(Math.round(totalValue))} ₴
          </span>
        )}
        {open
          ? <ChevronDown size={15} className="text-gray-600 shrink-0" />
          : <ChevronRight size={15} className="text-gray-600 shrink-0" />
        }
      </button>

      {/* Inventory table */}
      {open && (
        <>
          {filteredInventory.length === 0 ? (
            <div className="px-5 py-4 text-xs text-gray-600 border-t border-gray-800/60">
              {search ? "Нічого не знайдено" : "Склад порожній"}
            </div>
          ) : (
            <div className="border-t border-gray-800/60 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-gray-900/60">
                  <tr>
                    {["Товар", "Кількість", "Якість", "Вартість", "Автопродаж"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-[10px] uppercase tracking-wide text-gray-600 font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {filteredInventory.map((inv) => {
                    const bp       = basePriceMap[inv.product.id] ?? 0;
                    const estValue = inv.quantity * bp;
                    const hasAuto  = (inv.autoSellThreshold ?? 0) > 0;

                    return (
                      <tr
                        key={inv.product.id}
                        className="hover:bg-gray-800/20 transition-colors"
                      >
                        {/* Product name */}
                        <td className="px-4 py-2.5">
                          <p className="text-white font-medium text-sm">
                            {inv.product.nameUa}
                          </p>
                          <p className="text-[10px] text-gray-600">{inv.product.unit}</p>
                        </td>

                        {/* Quantity */}
                        <td className="px-4 py-2.5 font-mono text-white whitespace-nowrap">
                          {formatNumber(inv.quantity)}
                          <span className="text-gray-600 text-[10px] ml-1">
                            {inv.product.unit}
                          </span>
                        </td>

                        {/* Quality bar */}
                        <td className="px-4 py-2.5 min-w-[140px]">
                          <QualityBar value={inv.avgQuality} size="sm" showLabel />
                        </td>

                        {/* Estimated value */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {bp > 0 ? (
                            <span className="font-mono text-amber-400 text-xs">
                              {formatNumber(Math.round(estValue))} ₴
                            </span>
                          ) : (
                            <span className="text-gray-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Auto-sell badge */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {hasAuto ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              ⚡ {formatNumber(inv.autoSellThreshold!)} / тік
                              {inv.autoSellPriceUah != null && (
                                <span className="text-gray-500">
                                  @ {inv.autoSellPriceUah} ₴
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-700 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────

function WarehousesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-800 p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
          <div className="space-y-2 pt-2">
            {[0, 1, 2].map((j) => <Skeleton key={j} className="h-10 w-full" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function WarehousesClient() {
  const [raw,     setRaw]     = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ApiResponse) => setRaw(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => (raw ? normalise(raw) : null), [raw]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <WarehousesSkeleton />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center text-red-400 text-sm">
        Не вдалося завантажити склади{error ? `: ${error}` : ""}
      </div>
    );
  }

  const { enterprises, warehouses, basePriceMap } = data;

  // ── Empty state ───────────────────────────────────────────────────────────
  if (enterprises.length === 0 && warehouses.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="rounded-xl border border-dashed border-gray-700 py-20 text-center">
          <Building2 size={32} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Підприємств ще немає</p>
        </div>
      </div>
    );
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalValue = enterprises.reduce((sum, e) =>
    sum + e.inventory.reduce((s2, i) => s2 + i.quantity * (basePriceMap[i.product.id] ?? 0), 0),
    0,
  );
  const totalProductTypes = new Set(
    enterprises.flatMap((e) => e.inventory.map((i) => i.product.id)),
  ).size;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Warehouse size={22} className="text-violet-400" /> Склади
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Запаси на всіх підприємствах компанії
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук товару..."
            className="bg-gray-800 border border-gray-700 rounded-xl pl-8 pr-4 py-2 text-sm text-white
                       placeholder-gray-500 outline-none focus:border-gray-500 w-52 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Summary stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">
            <TrendingUp size={9} className="inline mr-1 text-amber-400" />
            Загальна вартість
          </p>
          <p className="font-mono text-amber-400 font-bold text-base leading-none">
            {formatNumber(Math.round(totalValue))}
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">грн</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Підприємств</p>
          <p className="text-2xl font-bold text-white leading-none">{enterprises.length}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Товарів (видів)</p>
          <p className="text-2xl font-bold text-white leading-none">{totalProductTypes}</p>
        </div>
        <div className="rounded-xl border border-violet-900/30 bg-violet-950/10 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Складів</p>
          <p className="text-2xl font-bold text-white leading-none">{warehouses.length}</p>
        </div>
      </div>

      {/* ── 3. Warehouse capacity bars ────────────────────────────────── */}
      {warehouses.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Ємність складів
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {warehouses.map((wh) => (
              <WarehouseBar key={wh.id} wh={wh} />
            ))}
          </div>
        </div>
      )}

      {/* ── 1+2. Enterprise cards ─────────────────────────────────────── */}
      <div className="space-y-3">
        {search && (
          <p className="text-xs text-gray-500">
            Пошук: <span className="text-white">{search}</span>
          </p>
        )}
        {enterprises.map((ent) => (
          <EnterpriseCard
            key={ent.id}
            ent={ent}
            basePriceMap={basePriceMap}
            search={search}
          />
        ))}

        {/* If search has no results anywhere */}
        {search && enterprises.every((e) =>
          e.inventory.every((i) => !i.product.nameUa.toLowerCase().includes(search.toLowerCase()))
        ) && (
          <div className="rounded-xl border border-dashed border-gray-700 py-12 text-center">
            <Package size={24} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              Товар <span className="text-white">"{search}"</span> не знайдено
            </p>
            <Button
              variant="outline"
              className="mt-4 text-xs"
              onClick={() => setSearch("")}
            >
              Скинути пошук
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
