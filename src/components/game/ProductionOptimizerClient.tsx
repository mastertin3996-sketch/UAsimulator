"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, Search, RefreshCw,
  Zap, Star, ChevronDown, ChevronUp, Factory, AlertTriangle,
  CheckCircle2, Flame, Lightbulb,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputItem {
  productId  : string;
  productName: string;
  productIcon: string | null;
  unit       : string;
  amount     : number;
  basePrice  : number;
  wsPrice    : number | null;
  wsStock    : number;
  bestPrice  : number;
  lineCost   : number;
}

interface RecipeRow {
  id          : string;
  name        : string;
  category    : string;
  outputProduct: { id: string; name: string; unit: string; icon: string | null; basePrice: number; category: string };
  outputAmount : number;
  inputs       : InputItem[];
  market: {
    retailPrice  : number | null;
    saturation   : number | null;
    status       : "SURPLUS" | "DEFICIT" | "BALANCED" | "NO_DATA";
    retailSold   : number;
    priceVsBase  : number;
  };
  economics: {
    outputPrice   : number;
    grossRevenue  : number;
    totalInputCost: number;
    grossMargin   : number;
    marginPct     : number;
    roi           : number | null;
  };
  myLinesCount : number;
  isUsedByMe   : boolean;
  hasAllInputs : boolean;
}

interface OptimizerData {
  lastTickNumber: number | null;
  recipes       : RecipeRow[];
  summary       : { total: number; profitable: number; deficit: number; myRecipes: number };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  DEFICIT : { label: "Дефіцит",   cls: "bg-red-950/60 text-red-400 border-red-800",         Icon: TrendingUp   },
  SURPLUS : { label: "Профіцит",  cls: "bg-blue-950/60 text-blue-400 border-blue-800",       Icon: TrendingDown },
  BALANCED: { label: "Баланс",    cls: "bg-emerald-950/60 text-emerald-400 border-emerald-800", Icon: Minus     },
  NO_DATA : { label: "Немає даних", cls: "bg-gray-800 text-gray-500 border-gray-700",        Icon: Minus        },
} as const;

function MarketBadge({ status }: { status: RecipeRow["market"]["status"] }) {
  const { label, cls, Icon } = STATUS_CFG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium", cls)}>
      <Icon size={9} />{label}
    </span>
  );
}

// ─── Margin bar ───────────────────────────────────────────────────────────────

function MarginBar({ pct }: { pct: number }) {
  const clamped = Math.max(-100, Math.min(100, pct));
  const isPos   = clamped >= 0;
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", isPos ? "bg-emerald-500" : "bg-red-500")}
        style={{ width: `${Math.abs(clamped)}%`, marginLeft: isPos ? "0" : `${100 - Math.abs(clamped)}%` }}
      />
    </div>
  );
}

// ─── Recipe card ─────────────────────────────────────────────────────────────

function RecipeCard({ recipe, rank }: { recipe: RecipeRow; rank: number }) {
  const [open, setOpen] = useState(false);
  const eco             = recipe.economics;
  const mkt             = recipe.market;
  const isProfit        = eco.grossMargin > 0;
  const isOpportunity   = isProfit && mkt.status === "DEFICIT";

  const RANK_COLORS = ["text-amber-400", "text-gray-300", "text-amber-600"];
  const rankColor   = rank <= 3 ? RANK_COLORS[rank - 1] : "text-gray-600";

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      isOpportunity   ? "border-emerald-600/50 bg-emerald-950/10"
      : isProfit      ? "border-gray-700 bg-gray-900"
      :                 "border-gray-800 bg-gray-900/50 opacity-80",
    )}>
      {/* Opportunity banner */}
      {isOpportunity && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
          <Flame size={11} className="text-emerald-400" />
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Можливість — дефіцит + прибуток</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("text-sm font-bold shrink-0 w-6 text-right", rankColor)}>
              #{rank}
            </span>
            <span className="text-xl shrink-0">{recipe.outputProduct.icon ?? "📦"}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-semibold text-white text-sm">{recipe.outputProduct.name}</p>
                {recipe.isUsedByMe && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] bg-violet-900 text-violet-300 border border-violet-700 px-1.5 py-0.5 rounded font-semibold">
                    <Factory size={8} /> {recipe.myLinesCount} ліній
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-500">{recipe.name} · {recipe.outputProduct.category}</p>
            </div>
          </div>
          <MarketBadge status={mkt.status} />
        </div>

        {/* Economics strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-gray-800/50 px-2 py-2">
            <p className="text-[9px] text-gray-600 uppercase tracking-wide mb-0.5">Виручка</p>
            <p className="text-xs font-mono text-white">{formatNumber(Math.round(eco.grossRevenue))}</p>
            <p className="text-[9px] text-gray-600">GC / цикл</p>
          </div>
          <div className="rounded-lg bg-gray-800/50 px-2 py-2">
            <p className="text-[9px] text-gray-600 uppercase tracking-wide mb-0.5">Витрати</p>
            <p className="text-xs font-mono text-gray-400">−{formatNumber(Math.round(eco.totalInputCost))}</p>
            <p className="text-[9px] text-gray-600">GC / цикл</p>
          </div>
          <div className={cn("rounded-lg px-2 py-2", isProfit ? "bg-emerald-950/40" : "bg-red-950/30")}>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide mb-0.5">Маржа</p>
            <p className={cn("text-xs font-bold font-mono", isProfit ? "text-emerald-400" : "text-red-400")}>
              {isProfit ? "+" : ""}{formatNumber(Math.round(eco.grossMargin))}
            </p>
            <p className={cn("text-[9px]", isProfit ? "text-emerald-600" : "text-red-600")}>
              {eco.marginPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Margin bar */}
        <div>
          <div className="flex justify-between text-[9px] text-gray-600 mb-0.5">
            <span>Маржинальність</span>
            {eco.roi !== null && (
              <span>ROI: <span className={eco.roi >= 0 ? "text-emerald-500" : "text-red-500"}>{eco.roi.toFixed(0)}%</span></span>
            )}
          </div>
          <MarginBar pct={eco.marginPct} />
        </div>

        {/* Output price vs base */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {mkt.retailPrice != null ? (
              <>
                <span className="text-white font-mono">{mkt.retailPrice.toFixed(2)} GC/{recipe.outputProduct.unit}</span>
                {mkt.priceVsBase >= 1.1 && <span className="text-amber-400 text-[10px]">+{((mkt.priceVsBase - 1) * 100).toFixed(0)}% до бази</span>}
                {mkt.priceVsBase <= 0.9 && <span className="text-red-400 text-[10px]">{((mkt.priceVsBase - 1) * 100).toFixed(0)}% до бази</span>}
              </>
            ) : (
              <span className="text-gray-600 text-[11px]">Роздрібна ціна: база {recipe.outputProduct.basePrice.toFixed(2)} GC</span>
            )}
          </div>
          <span className="text-gray-600 text-[10px]">вихід: {recipe.outputAmount} {recipe.outputProduct.unit}</span>
        </div>

        {/* Inputs toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[11px] text-gray-500 hover:text-gray-300 transition-colors border-t border-gray-800/60 pt-2"
        >
          <span>Вхідні ресурси ({recipe.inputs.length})</span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {open && (
          <div className="space-y-1.5">
            {recipe.inputs.map((inp) => (
              <div key={inp.productId} className="flex items-center justify-between text-xs bg-gray-800/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {inp.productIcon && <span className="text-sm">{inp.productIcon}</span>}
                  <div>
                    <span className="text-white">{inp.productName}</span>
                    <span className="text-gray-600 ml-1.5 text-[10px]">{inp.amount} {inp.unit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-gray-300">{inp.bestPrice.toFixed(2)} GC/{inp.unit}</span>
                  <span className="text-gray-600 ml-1 text-[10px]">= {formatNumber(Math.round(inp.lineCost))} GC</span>
                  {inp.wsPrice !== null && inp.wsPrice < inp.basePrice && (
                    <div className="text-[9px] text-emerald-500">оптова (дешевша)</div>
                  )}
                  {inp.wsPrice !== null && inp.wsPrice > inp.basePrice * 1.2 && (
                    <div className="text-[9px] text-amber-500">оптова (дорога)</div>
                  )}
                  {inp.wsPrice === null && (
                    <div className="text-[9px] text-gray-600">баз. ціна</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type SortKey    = "margin" | "roi" | "revenue" | "marginPct" | "saturation";
type FilterKey  = "ALL" | "PROFITABLE" | "DEFICIT" | "MY" | "SURPLUS";
type CatFilter  = "ALL" | "EXTRACTION" | "PRODUCTION" | "TRADE" | "LOGISTICS";

const SORT_LABELS: Record<SortKey, string> = {
  margin    : "Маржа GC",
  roi       : "ROI %",
  revenue   : "Виручка",
  marginPct : "Маржа %",
  saturation: "Дефіцит → Профіцит",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  ALL      : "Всі",
  PROFITABLE: "Прибуткові",
  DEFICIT  : "Дефіцитні",
  MY       : "Мої рецепти",
  SURPLUS  : "Профіцит",
};

const CAT_LABELS: Record<CatFilter, string> = {
  ALL       : "Всі категорії",
  EXTRACTION: "Видобуток",
  PRODUCTION: "Виробництво",
  TRADE     : "Торгівля",
  LOGISTICS : "Логістика",
};

export default function ProductionOptimizerClient() {
  const [data,    setData]    = useState<OptimizerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [sort,    setSort]    = useState<SortKey>("margin");
  const [filter,  setFilter]  = useState<FilterKey>("ALL");
  const [cat,     setCat]     = useState<CatFilter>("ALL");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/optimizer")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    if (!data) return [];
    let list = [...data.recipes];

    // Filter
    if (filter === "PROFITABLE") list = list.filter((r) => r.economics.grossMargin > 0);
    if (filter === "DEFICIT")    list = list.filter((r) => r.market.status === "DEFICIT");
    if (filter === "SURPLUS")    list = list.filter((r) => r.market.status === "SURPLUS");
    if (filter === "MY")         list = list.filter((r) => r.isUsedByMe);

    // Category filter
    if (cat !== "ALL") list = list.filter((r) => r.category === cat);

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.outputProduct.name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case "margin"    : return b.economics.grossMargin - a.economics.grossMargin;
        case "roi"       : return (b.economics.roi ?? -999) - (a.economics.roi ?? -999);
        case "revenue"   : return b.economics.grossRevenue - a.economics.grossRevenue;
        case "marginPct" : return b.economics.marginPct - a.economics.marginPct;
        case "saturation": return (a.market.saturation ?? 999) - (b.market.saturation ?? 999);
        default          : return 0;
      }
    });

    return list;
  }, [data, filter, cat, search, sort]);

  const opportunities = useMemo(() =>
    sorted.filter((r) => r.economics.grossMargin > 0 && r.market.status === "DEFICIT"),
  [sorted]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lightbulb size={22} className="text-amber-400" />
            Оптимізатор виробництва
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Аналіз прибутковості рецептів за поточними ринковими цінами
            {data?.lastTickNumber && ` · тік #${data.lastTickNumber}`}
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

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Всього рецептів</p>
            <p className="text-2xl font-bold text-white">{data.summary.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={11} className="text-emerald-400" />
              <p className="text-[10px] text-emerald-400 uppercase tracking-wide">Прибуткових</p>
            </div>
            <p className="text-2xl font-bold text-emerald-300">{data.summary.profitable}</p>
          </div>
          <div className="rounded-xl border border-red-900/30 bg-red-950/10 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={11} className="text-red-400" />
              <p className="text-[10px] text-red-400 uppercase tracking-wide">Дефіцитних</p>
            </div>
            <p className="text-2xl font-bold text-red-300">{data.summary.deficit}</p>
          </div>
          <div className="rounded-xl border border-violet-900/30 bg-violet-950/10 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Factory size={11} className="text-violet-400" />
              <p className="text-[10px] text-violet-400 uppercase tracking-wide">Мої рецепти</p>
            </div>
            <p className="text-2xl font-bold text-violet-300">{data.summary.myRecipes}</p>
          </div>
        </div>
      )}

      {/* Opportunities banner */}
      {!loading && opportunities.length > 0 && (
        <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/15 p-4 flex items-start gap-3">
          <Zap size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">
              {opportunities.length} {opportunities.length === 1 ? "можливість" : "можливостей"} прямо зараз
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Прибуткові рецепти + дефіцит на ринку:{" "}
              {opportunities.slice(0, 4).map((r) => r.outputProduct.name).join(", ")}
              {opportunities.length > 4 && ` і ще ${opportunities.length - 4}`}
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-2">
        {/* Filters row */}
        <div className="flex flex-wrap gap-2">
          {(Object.entries(FILTER_LABELS) as [FilterKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                filter === key ? "bg-violet-700 text-white" : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700",
              )}
            >
              {label}
              {key === "MY" && data && ` (${data.summary.myRecipes})`}
              {key === "DEFICIT" && data && ` (${data.summary.deficit})`}
              {key === "PROFITABLE" && data && ` (${data.summary.profitable})`}
            </button>
          ))}
        </div>

        {/* Sort + Search + Category row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук рецепту..."
              className="bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 w-44"
            />
          </div>

          <select
            value={cat}
            onChange={(e) => setCat(e.target.value as CatFilter)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            {(Object.entries(CAT_LABELS) as [CatFilter, string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-gray-500">Сортувати:</span>
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs transition-all",
                  sort === key ? "bg-amber-700 text-white font-medium" : "bg-gray-800 text-gray-400 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {loading && !data ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-500">Помилка завантаження</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Search size={32} className="mx-auto text-gray-700" />
          <p className="text-gray-500">Нічого не знайдено</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-600 text-right">{sorted.length} рецептів</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((r, i) => (
              <RecipeCard key={r.id} recipe={r} rank={i + 1} />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[11px] text-gray-600 border-t border-gray-800 pt-4">
            <span className="flex items-center gap-1.5"><Flame size={10} className="text-emerald-400" /> Прибуток + дефіцит = найкраща можливість</span>
            <span className="flex items-center gap-1.5"><Star size={10} className="text-amber-400" /> Маржа = виручка − вартість входів за поточними цінами</span>
            <span className="flex items-center gap-1.5"><Factory size={10} className="text-violet-400" /> Кількість ваших активних ліній з цим рецептом</span>
          </div>
        </>
      )}
    </div>
  );
}
