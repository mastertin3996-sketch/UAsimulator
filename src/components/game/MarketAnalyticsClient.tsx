"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Search, RefreshCw, BarChart2, Package, Building2, Star,
  AlertTriangle, Loader2, Factory, Flame, ArrowUp, ArrowDown,
  Zap, ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductStats {
  production       : number;
  avgQuality       : number | null;
  retailSold       : number;
  retailRevenue    : number;
  avgRetailPrice   : number | null;
  avgWholesalePrice: number | null;
  wholesaleStock   : number;
  saturationIndex  : number | null;
  status           : "SURPLUS" | "DEFICIT" | "BALANCED" | "NO_DATA";
}

interface ProductRow {
  id            : string;
  name          : string;
  unit          : string;
  icon          : string | null;
  basePrice     : number;
  isRawMaterial : boolean;
  category      : string;
  categoryIcon  : string | null;
  stats         : ProductStats;
}

interface CompanyRow {
  rank              : number;
  id                : string;
  name              : string;
  ownerUsername     : string;
  ownerLevel        : number;
  rating            : number;
  brandLevel        : number;
  totalAssets       : number;
  gameCash          : number;
  netWorth          : number;
  activeEnterprises : number;
  isMe              : boolean;
}

interface MarketData {
  lastTick           : { tickNumber: number; processedAt: string } | null;
  products           : ProductRow[];
  companies          : CompanyRow[];
  myProductIds       : string[];
  totalRetailRevenue : number;
}

interface HistoryPoint {
  tickNumber        : number;
  avgRetailPrice    : number | null;
  totalRetailSold   : number;
  saturationIndex   : number | null;
  totalProduction   : number;
  avgQuality        : number | null;
  avgWholesalePrice : number | null;
}

interface PriceMover {
  id            : string;
  name          : string;
  icon          : string | null;
  unit          : string;
  basePrice     : number;
  category      : string;
  priceOld      : number | null;
  priceNew      : number | null;
  changePct     : number | null;
  avgSaturation : number | null;
  status        : "SURPLUS" | "DEFICIT" | "BALANCED" | "NO_DATA";
}

interface CategoryStat {
  category       : string;
  productCount   : number;
  activeProducts : number;
  avgSaturation  : number | null;
  totalProduction: number;
  totalRetailSold: number;
  deficitCount   : number;
  surplusCount   : number;
}

interface Wholesaler {
  companyName : string;
  offerCount  : number;
  totalQty    : number;
  totalRevenue: number;
  isMe        : boolean;
}

interface TrendsData {
  tickWindow     : { oldest: number | null; newest: number | null };
  topRisers      : PriceMover[];
  topFallers     : PriceMover[];
  categoryStats  : CategoryStat[];
  topWholesalers : Wholesaler[];
  marketSummary  : { totalActiveOffers: number; totalQtyForSale: number; totalActiveCompanies: number };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  SURPLUS : { label: "Профіцит",   cls: "bg-blue-950/60 text-blue-400 border-blue-800",    icon: TrendingDown },
  DEFICIT : { label: "Дефіцит",    cls: "bg-red-950/60  text-red-400  border-red-800",     icon: TrendingUp   },
  BALANCED: { label: "Баланс",     cls: "bg-emerald-950/60 text-emerald-400 border-emerald-800", icon: Minus  },
  NO_DATA : { label: "Немає даних",cls: "bg-gray-800    text-gray-500 border-gray-700",    icon: Minus        },
} as const;

function StatusBadge({ status }: { status: ProductStats["status"] }) {
  const cfg  = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", cfg.cls)}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Opportunity Panel ────────────────────────────────────────────────────────

function OpportunityPanel({ products, myProductIds }: { products: ProductRow[]; myProductIds: string[] }) {
  const deficits = products
    .filter((p) => p.stats.status === "DEFICIT" && p.stats.saturationIndex !== null)
    .sort((a, b) => (a.stats.saturationIndex ?? 1) - (b.stats.saturationIndex ?? 1))
    .slice(0, 6);

  if (deficits.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flame size={14} className="text-red-400" />
        <h3 className="text-sm font-semibold text-white">Гарячий попит — можливості для виробництва</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {deficits.map((p) => {
          const isMyProd = myProductIds.includes(p.id);
          const satPct   = Math.round((p.stats.saturationIndex ?? 0) * 100);
          return (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border p-2.5 space-y-1",
                isMyProd
                  ? "border-emerald-500/30 bg-emerald-950/20"
                  : "border-red-900/20 bg-red-950/10",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-base leading-none">{p.icon ?? "📦"}</span>
                {isMyProd && (
                  <span className="text-[9px] text-emerald-400 bg-emerald-950 px-1 py-0.5 rounded font-medium">Мій</span>
                )}
              </div>
              <p className="text-xs font-medium text-white leading-tight truncate">{p.name}</p>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-red-400">{satPct}%</span>
                  {p.stats.avgRetailPrice && (
                    <span className="text-[10px] text-gray-500">{p.stats.avgRetailPrice.toFixed(1)} GC</span>
                  )}
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{ width: `${Math.min(100, satPct)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-600">
        Saturation &lt; 75% = дефіцит. Зелена рамка = товар вже у вашому виробництві.
      </p>
    </div>
  );
}

// ─── Custom Tooltip for Recharts ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RechartsTooltipProps = { active?: boolean; payload?: readonly any[]; label?: number | string };

function PriceTooltip({ active, payload, label, unit }: RechartsTooltipProps & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5">Тік {label}</p>
      {payload.map((p: { name?: string; value?: number; color?: string }) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-white font-semibold">
            {p.value != null ? `${p.value.toFixed(2)} GC/${unit}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function VolumeTooltip({ active, payload, label, unit }: RechartsTooltipProps & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5">Тік {label}</p>
      {payload.map((p: { name?: string; value?: number; color?: string }) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-white font-semibold">
            {p.value != null ? Math.round(p.value).toLocaleString() : "0"} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Price history drawer ─────────────────────────────────────────────────────

function PriceHistoryDrawer({ product, onClose }: {
  product: ProductRow;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/price-history?productId=${product.id}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .finally(() => setLoading(false));
  }, [product.id]);

  const hasRetailData     = history.some((h) => h.avgRetailPrice !== null);
  const hasWholesaleData  = history.some((h) => h.avgWholesalePrice !== null);
  const hasVolumeData     = history.some((h) => h.totalRetailSold > 0 || h.totalProduction > 0);

  return (
    <div className="mt-2 rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{product.icon ?? "📦"}</span>
          <div>
            <p className="text-white font-semibold text-sm">{product.name}</p>
            <p className="text-gray-500 text-xs">
              Базова ціна: {product.basePrice.toFixed(2)} GC/{product.unit} · Остання 10 тіків
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <ChevronUp size={16} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-center text-gray-600 py-8 text-sm">Даних за тіки ще немає</p>
      ) : (
        <div className="space-y-4">
          {/* Price chart */}
          {hasRetailData && (
            <div>
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Ціни (GC/{product.unit})</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="tickNumber"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickLine={false}
                    label={{ value: "Тік", position: "insideBottom", offset: -2, fill: "#4b5563", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} width={45} />
                  <Tooltip content={(props) => <PriceTooltip {...props} unit={product.unit} />} />
                  <ReferenceLine
                    y={product.basePrice}
                    stroke="#374151"
                    strokeDasharray="4 2"
                    label={{ value: "База", fill: "#6b7280", fontSize: 9 }}
                  />
                  {hasRetailData && (
                    <Line
                      type="monotone" dataKey="avgRetailPrice" name="Роздрібна"
                      stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }}
                      connectNulls
                    />
                  )}
                  {hasWholesaleData && (
                    <Line
                      type="monotone" dataKey="avgWholesalePrice" name="Оптова"
                      stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }}
                      strokeDasharray="5 3"
                      connectNulls
                    />
                  )}
                  <Legend
                    wrapperStyle={{ fontSize: 10, color: "#9ca3af" }}
                    iconType="line"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Volume chart */}
          {hasVolumeData && (
            <div>
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Обсяги ({product.unit})</p>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={history} margin={{ top: 2, right: 8, bottom: 2, left: 4 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="tickNumber" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} width={45} />
                  <Tooltip content={(props) => <VolumeTooltip {...props} unit={product.unit} />} />
                  <Bar dataKey="totalProduction" name="Виробництво" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="totalRetailSold"  name="Продано NPC" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#9ca3af" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Products table ────────────────────────────────────────────────────────────

type SortKey    = "name" | "production" | "retailSold" | "avgRetailPrice" | "avgWholesalePrice" | "saturationIndex";
type StatusFilter = "ALL" | "DEFICIT" | "SURPLUS" | "BALANCED";

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: "Всі", DEFICIT: "Дефіцит", SURPLUS: "Профіцит", BALANCED: "Баланс",
};

function ProductsTab({ products, myProductIds }: { products: ProductRow[]; myProductIds: string[] }) {
  const [search,      setSearch]      = useState("");
  const [catFilter,   setCatFilter]   = useState("Всі");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey,     setSortKey]     = useState<SortKey>("production");
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc");
  const [expanded,    setExpanded]    = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = ["Всі", ...new Set(products.map((p) => p.category))].sort((a, b) =>
      a === "Всі" ? -1 : b === "Всі" ? 1 : a.localeCompare(b, "uk"),
    );
    return cats;
  }, [products]);

  const sorted = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchCat    = catFilter === "Всі" || p.category === catFilter;
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || p.stats.status === statusFilter;
      return matchCat && matchSearch && matchStatus;
    });

    return [...filtered].sort((a, b) => {
      let va = 0, vb = 0;
      switch (sortKey) {
        case "name"            : return sortDir === "asc"
          ? a.name.localeCompare(b.name, "uk") : b.name.localeCompare(a.name, "uk");
        case "production"      : va = a.stats.production;         vb = b.stats.production;         break;
        case "retailSold"      : va = a.stats.retailSold;         vb = b.stats.retailSold;         break;
        case "avgRetailPrice"  : va = a.stats.avgRetailPrice ?? 0; vb = b.stats.avgRetailPrice ?? 0; break;
        case "avgWholesalePrice": va = a.stats.avgWholesalePrice ?? 0; vb = b.stats.avgWholesalePrice ?? 0; break;
        case "saturationIndex" : va = a.stats.saturationIndex ?? 0; vb = b.stats.saturationIndex ?? 0; break;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [products, catFilter, statusFilter, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-gray-700">↕</span>;
    return <span className="text-violet-400">{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук товару..."
            className="bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 w-44"
          />
        </div>
        {/* Status filter */}
        <div className="flex gap-1">
          {(["ALL", "DEFICIT", "SURPLUS", "BALANCED"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                statusFilter === s
                  ? s === "DEFICIT"  ? "bg-red-700 text-white"
                    : s === "SURPLUS"  ? "bg-blue-700 text-white"
                    : s === "BALANCED" ? "bg-emerald-700 text-white"
                    : "bg-violet-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700",
              )}
            >
              {STATUS_FILTER_LABELS[s]}
            </button>
          ))}
        </div>
        {/* Category filter */}
        <div className="flex gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                catFilter === c
                  ? "bg-violet-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/80">
              <th className="text-left px-3 py-3 text-gray-400 font-medium w-8" />
              <th
                className="text-left px-3 py-3 text-gray-400 font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("name")}
              >
                Товар <SortIcon k="name" />
              </th>
              <th
                className="text-right px-3 py-3 text-gray-400 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("production")}
              >
                Виробництво <SortIcon k="production" />
              </th>
              <th
                className="text-right px-3 py-3 text-gray-400 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("retailSold")}
              >
                Продано NPC <SortIcon k="retailSold" />
              </th>
              <th
                className="text-right px-3 py-3 text-gray-400 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("avgRetailPrice")}
              >
                Роздрібна ціна <SortIcon k="avgRetailPrice" />
              </th>
              <th
                className="text-right px-3 py-3 text-gray-400 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                onClick={() => toggleSort("avgWholesalePrice")}
              >
                Оптова ціна <SortIcon k="avgWholesalePrice" />
              </th>
              <th className="text-center px-3 py-3 text-gray-400 font-medium">Стан ринку</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-600">
                  Нічого не знайдено
                </td>
              </tr>
            ) : sorted.map((p) => (
              <>
                <tr
                  key={p.id}
                  onClick={() => setExpanded((e) => e === p.id ? null : p.id)}
                  className={cn(
                    "border-b border-gray-800/50 cursor-pointer transition-colors",
                    expanded === p.id ? "bg-gray-800/40" : "hover:bg-gray-800/20",
                  )}
                >
                  {/* Expand toggle */}
                  <td className="px-3 py-3 text-gray-600">
                    {expanded === p.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </td>

                  {/* Name */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.icon ?? "📦"}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium">{p.name}</p>
                          {myProductIds.includes(p.id) && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-400 bg-emerald-950 border border-emerald-800 rounded px-1 py-0.5">
                              <Factory size={8} /> Мій
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-xs">{p.category} · {p.unit}</p>
                      </div>
                    </div>
                  </td>

                  {/* Production */}
                  <td className="px-3 py-3 text-right">
                    {p.stats.production > 0 ? (
                      <span className="text-blue-400 font-mono">
                        {Math.round(p.stats.production).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  {/* Retail sold */}
                  <td className="px-3 py-3 text-right">
                    {p.stats.retailSold > 0 ? (
                      <span className="text-emerald-400 font-mono">
                        {Math.round(p.stats.retailSold).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  {/* Avg retail price */}
                  <td className="px-3 py-3 text-right">
                    {p.stats.avgRetailPrice != null ? (
                      <div>
                        <span className="text-white font-mono">{p.stats.avgRetailPrice.toFixed(2)}</span>
                        <span className="text-gray-600 text-xs ml-1">GC</span>
                        {p.stats.avgRetailPrice > p.basePrice * 1.1 && (
                          <span className="ml-1 text-xs text-amber-400">
                            +{(((p.stats.avgRetailPrice / p.basePrice) - 1) * 100).toFixed(0)}%
                          </span>
                        )}
                        {p.stats.avgRetailPrice < p.basePrice * 0.9 && (
                          <span className="ml-1 text-xs text-red-400">
                            {(((p.stats.avgRetailPrice / p.basePrice) - 1) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  {/* Avg wholesale price */}
                  <td className="px-3 py-3 text-right">
                    {p.stats.avgWholesalePrice != null ? (
                      <span className="text-violet-400 font-mono">{p.stats.avgWholesalePrice.toFixed(2)}</span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3 text-center">
                    <StatusBadge status={p.stats.status} />
                    {p.stats.saturationIndex != null && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        {p.stats.saturationIndex.toFixed(2)}×
                      </p>
                    )}
                  </td>
                </tr>

                {/* Expandable price history */}
                {expanded === p.id && (
                  <tr key={`${p.id}-drawer`}>
                    <td colSpan={7} className="px-4 pb-4">
                      <PriceHistoryDrawer product={p} onClose={() => setExpanded(null)} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600 text-right">
        {sorted.length} з {products.length} товарів · натисни на рядок для графіку цін
      </p>
    </div>
  );
}

// ─── Top corporations tab ─────────────────────────────────────────────────────

function CompaniesTab({ companies }: { companies: CompanyRow[] }) {
  const top10   = companies.slice(0, 10);
  const maxWorth = top10[0]?.netWorth ?? 1;

  const CorpTooltip = ({ active, payload, label }: {
    active?: boolean; payload?: { value: number; name: string }[]; label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-white font-semibold mb-1">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="text-gray-300">
            {p.name}: <span className="text-emerald-400 font-mono">{Math.round(p.value).toLocaleString()} GC</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Bar chart: top 10 */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart2 size={14} className="text-violet-400" />
          Топ 10 за активами (GC)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={top10.map((c) => ({ name: c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name, fullName: c.name, netWorth: c.netWorth, assets: c.totalAssets, cash: c.gameCash }))}
            layout="vertical"
            margin={{ left: 8, right: 20, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={110} tickLine={false} />
            <Tooltip content={<CorpTooltip />} />
            <Bar dataKey="assets" name="Активи"   stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
            <Bar dataKey="cash"   name="Готівка"  stackId="a" fill="#10b981" radius={[0, 2, 2, 0]} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Full table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/80">
              <th className="text-left px-3 py-3 text-gray-400 font-medium w-12">#</th>
              <th className="text-left px-3 py-3 text-gray-400 font-medium">Корпорація</th>
              <th className="text-right px-3 py-3 text-gray-400 font-medium">Капіталізація</th>
              <th className="text-right px-3 py-3 text-gray-400 font-medium">Активи</th>
              <th className="text-right px-3 py-3 text-gray-400 font-medium">Готівка</th>
              <th className="text-right px-3 py-3 text-gray-400 font-medium">Рейтинг</th>
              <th className="text-right px-3 py-3 text-gray-400 font-medium">Підпр-в</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr
                key={c.id}
                className={cn(
                  "border-b border-gray-800/40 transition-colors",
                  c.isMe    ? "bg-violet-950/20" : "hover:bg-gray-800/20",
                  c.rank <= 3 ? "bg-amber-950/10" : "",
                )}
              >
                <td className="px-3 py-3">
                  <span className={cn(
                    "text-sm font-bold",
                    c.rank === 1 ? "text-amber-400" : c.rank === 2 ? "text-gray-300" : c.rank === 3 ? "text-amber-600" : "text-gray-600",
                  )}>
                    {c.rank <= 3 ? ["🥇", "🥈", "🥉"][c.rank - 1] : `#${c.rank}`}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {c.isMe && <span className="text-xs bg-violet-900 text-violet-300 px-1.5 py-0.5 rounded font-medium">Ви</span>}
                    <div>
                      <p className="text-white font-medium">{c.name}</p>
                      <p className="text-gray-500 text-xs">@{c.ownerUsername} · Рів.{c.ownerLevel}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="text-emerald-400 font-mono font-semibold">
                    {Math.round(c.netWorth).toLocaleString()}
                  </span>
                  {/* Bar fill relative to #1 */}
                  <div className="mt-1 h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/50 rounded-full"
                      style={{ width: `${(c.netWorth / maxWorth) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-gray-300 font-mono text-xs">
                  {Math.round(c.totalAssets).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-blue-400 font-mono text-xs">
                  {Math.round(c.gameCash).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="flex items-center justify-end gap-1 text-amber-400">
                    <Star size={10} />
                    {Math.round(c.rating).toLocaleString()}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-gray-400">
                  <div className="flex items-center justify-end gap-1">
                    <Building2 size={10} className="text-gray-600" />
                    {c.activeEnterprises}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Price mover card ─────────────────────────────────────────────────────────

function MoverCard({ mover, direction }: { mover: PriceMover; direction: "up" | "down" }) {
  const pct = Math.abs(mover.changePct ?? 0);
  const isUp = direction === "up";
  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2 transition-all hover:brightness-110",
      isUp
        ? "border-emerald-900/50 bg-emerald-950/15"
        : "border-red-900/50 bg-red-950/15",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base shrink-0">{mover.icon ?? "📦"}</span>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{mover.name}</p>
            <p className="text-gray-600 text-[10px]">{mover.category}</p>
          </div>
        </div>
        <span className={cn(
          "flex items-center gap-0.5 text-xs font-bold shrink-0 px-2 py-0.5 rounded-full",
          isUp ? "text-emerald-400 bg-emerald-950/60" : "text-red-400 bg-red-950/60",
        )}>
          {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>{mover.priceOld != null ? `${mover.priceOld.toFixed(2)}` : "?"} GC</span>
        <span className="text-gray-700">→</span>
        <span className={isUp ? "text-emerald-400 font-mono" : "text-red-400 font-mono"}>
          {mover.priceNew != null ? `${mover.priceNew.toFixed(2)}` : "?"} GC
        </span>
        <span className="text-gray-700">·</span>
        <span>база {mover.basePrice.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Category saturation grid ─────────────────────────────────────────────────

function CategoryGrid({ stats }: { stats: CategoryStat[] }) {
  function satColor(sat: number | null): string {
    if (sat === null) return "border-gray-800 bg-gray-900/60 text-gray-600";
    if (sat > 1.4)   return "border-blue-800/60 bg-blue-950/30 text-blue-300";
    if (sat > 1.1)   return "border-blue-900/40 bg-blue-950/15 text-blue-400";
    if (sat < 0.6)   return "border-red-700/60 bg-red-950/40 text-red-300";
    if (sat < 0.85)  return "border-red-900/40 bg-red-950/20 text-red-400";
    return "border-emerald-900/40 bg-emerald-950/15 text-emerald-400";
  }
  function satLabel(sat: number | null): string {
    if (sat === null) return "н/д";
    if (sat > 1.25)  return "Профіцит";
    if (sat < 0.75)  return "Дефіцит";
    return "Баланс";
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {stats.map((c) => (
        <div key={c.category} className={cn("rounded-xl border p-3 space-y-1.5", satColor(c.avgSaturation))}>
          <p className="font-semibold text-sm text-white">{c.category}</p>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{c.productCount} товарів</span>
            <span className={cn("font-medium", satColor(c.avgSaturation).split(" ").pop())}>
              {satLabel(c.avgSaturation)}
            </span>
          </div>
          {c.avgSaturation !== null && (
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  c.avgSaturation > 1.25 ? "bg-blue-500" : c.avgSaturation < 0.75 ? "bg-red-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, (c.avgSaturation / 2) * 100)}%` }}
              />
            </div>
          )}
          <div className="flex justify-between text-[10px] text-gray-600 pt-0.5">
            {c.deficitCount > 0 && <span className="text-red-500">{c.deficitCount} дефіц.</span>}
            {c.surplusCount > 0 && <span className="text-blue-500">{c.surplusCount} проф.</span>}
            {c.deficitCount === 0 && c.surplusCount === 0 && <span>—</span>}
            <span>{c.totalRetailSold > 0 ? `${Math.round(c.totalRetailSold).toLocaleString()} прод.` : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Trends tab ───────────────────────────────────────────────────────────────

function TrendsTab() {
  const [data, setData]     = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/trends")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <Loader2 key={i} className="animate-spin text-gray-700 mx-auto" />)}
      </div>
    );
  }
  if (!data) return <div className="text-center py-16 text-gray-500">Помилка завантаження</div>;

  const { topRisers, topFallers, categoryStats, topWholesalers, marketSummary, tickWindow } = data;
  const hasMoves = topRisers.length > 0 || topFallers.length > 0;

  return (
    <div className="space-y-8">

      {/* Market pulse */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Активних оферт</p>
          <p className="text-2xl font-bold text-white">{marketSummary.totalActiveOffers.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Обсяг на ринку</p>
          <p className="text-2xl font-bold text-violet-400 font-mono">{Math.round(marketSummary.totalQtyForSale).toLocaleString()}</p>
          <p className="text-[10px] text-gray-600">одиниць</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Активних продавців</p>
          <p className="text-2xl font-bold text-white">{marketSummary.totalActiveCompanies.toLocaleString()}</p>
        </div>
      </div>

      {/* Price movers */}
      {hasMoves ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-white">
              Цінові рухи
              {tickWindow.oldest && tickWindow.newest && tickWindow.oldest !== tickWindow.newest && (
                <span className="text-gray-600 font-normal ml-2 text-xs">
                  тік #{tickWindow.oldest} → #{tickWindow.newest}
                </span>
              )}
            </h3>
          </div>

          {topRisers.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ArrowUp size={10} className="text-emerald-500" /> Найбільший ріст ціни
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topRisers.map((m) => <MoverCard key={m.id} mover={m} direction="up" />)}
              </div>
            </div>
          )}

          {topFallers.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ArrowDown size={10} className="text-red-500" /> Найбільше падіння ціни
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topFallers.map((m) => <MoverCard key={m.id} mover={m} direction="down" />)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-600 text-sm border border-gray-800 rounded-xl">
          Недостатньо тіків для порівняння цін
        </div>
      )}

      {/* Category grid */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Насиченість по категоріях</h3>
        </div>
        <CategoryGrid stats={categoryStats} />
        <p className="text-[10px] text-gray-600">
          Колір визначається за середнім saturation index за останні 10 тіків. Зелений — баланс, червоний — дефіцит, синій — профіцит.
        </p>
      </div>

      {/* Top wholesalers */}
      {topWholesalers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShoppingBag size={14} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Топ оптових продавців (активні оферти)</h3>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Компанія</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Офертів</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Обсяг</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Виручка (всього)</th>
                </tr>
              </thead>
              <tbody>
                {topWholesalers.map((w, i) => (
                  <tr
                    key={w.companyName}
                    className={cn(
                      "border-b border-gray-800/40 transition-colors",
                      w.isMe ? "bg-violet-950/20" : "hover:bg-gray-800/20",
                    )}
                  >
                    <td className="px-4 py-3 text-gray-500 text-sm">#{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {w.isMe && <span className="text-[10px] bg-violet-900 text-violet-300 px-1.5 py-0.5 rounded">Ви</span>}
                        <span className="text-white font-medium">{w.companyName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{w.offerCount}</td>
                    <td className="px-4 py-3 text-right text-violet-400 font-mono">
                      {Math.round(w.totalQty).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono">
                      {w.totalRevenue > 0 ? `+${Math.round(w.totalRevenue).toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MarketAnalyticsClient() {
  const [data,    setData]    = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"products" | "companies" | "trends">("products");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/market");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deficitCount = data?.products.filter((p) => p.stats.status === "DEFICIT").length ?? 0;
  const surplusCount = data?.products.filter((p) => p.stats.status === "SURPLUS").length ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-400" />
            Аналітика ринку
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.lastTick
              ? `Дані за тік #${data.lastTick.tickNumber} · ${new Date(data.lastTick.processedAt).toLocaleString("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Тіки ще не виконувались"}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Оновити
        </button>
      </div>

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Товарів у грі</p>
            <p className="text-2xl font-bold text-white">{data.products.length}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {data.myProductIds.length > 0 ? `${data.myProductIds.length} у моєму виробництві` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-red-900/30 bg-red-950/10 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={11} className="text-red-400" />
              <p className="text-xs text-red-400">Дефіцит</p>
            </div>
            <p className="text-2xl font-bold text-red-300">{deficitCount}</p>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Package size={11} className="text-blue-400" />
              <p className="text-xs text-blue-400">Профіцит</p>
            </div>
            <p className="text-2xl font-bold text-blue-300">{surplusCount}</p>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={11} className="text-emerald-400" />
              <p className="text-xs text-emerald-400">Виручка ринку (тік)</p>
            </div>
            <p className="text-lg font-bold text-emerald-300 font-mono">
              {Math.round(data.totalRetailRevenue).toLocaleString()} <span className="text-xs font-normal">GC</span>
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {([
          { key: "products",  label: "Огляд товарів",    icon: Package   },
          { key: "companies", label: "Топ корпорацій",   icon: Building2 },
          { key: "trends",    label: "Тренди ринку",     icon: Zap       },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === key
                ? "bg-violet-700 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-500">Помилка завантаження</div>
      ) : tab === "products" ? (
        <div className="space-y-5">
          <OpportunityPanel products={data.products} myProductIds={data.myProductIds} />
          <ProductsTab products={data.products} myProductIds={data.myProductIds} />
        </div>
      ) : tab === "companies" ? (
        <CompaniesTab companies={data.companies} />
      ) : (
        <TrendsTab />
      )}
    </div>
  );
}
