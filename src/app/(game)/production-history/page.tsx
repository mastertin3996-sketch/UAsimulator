"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Factory, TrendingUp, TrendingDown, Package,
  ChevronDown, ChevronUp, BarChart3, LayoutList,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  productId      : string;
  productName    : string;
  unit           : string;
  qtySold        : number;
  revenue        : number;
  avgPrice       : number;
  saturationIndex: number;
  globalProduced : number | null;
}

interface TickRow {
  tickNumber  : number;
  processedAt : string | null;
  totalRevenue: number;
  totalQtySold: number;
  products    : ProductRow[];
}

interface ProdSummary {
  productId: string;
  name     : string;
  unit     : string;
  totalQty : number;
  totalRev : number;
}

interface Summary {
  totalRevenue    : number;
  totalQtySold    : number;
  tickCount       : number;
  bestTickNumber  : number | null;
  bestTickRevenue : number;
  byProduct       : ProdSummary[];
}

interface EntOption { id: string; name: string }
interface ProdOption { id: string; name: string; unit: string }

interface HistoryData {
  ticks        : TickRow[];
  summary      : Summary | null;
  myEnterprises: EntOption[];
  myProducts   : ProdOption[];
}

// ─── Saturation helpers ───────────────────────────────────────────────────────

function satLabel(idx: number): { label: string; color: string; bg: string } {
  if (idx > 1.25) return { label: "Надлишок", color: "text-amber-400",   bg: "bg-amber-950/40 border-amber-900/40"   };
  if (idx < 0.75) return { label: "Дефіцит",  color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-900/40" };
  return              { label: "Баланс",   color: "text-blue-400",    bg: "bg-blue-950/40 border-blue-900/40"    };
}

function satColor(idx: number) {
  if (idx > 1.25) return "text-amber-400";
  if (idx < 0.75) return "text-emerald-400";
  return "text-blue-400";
}

// ─── SVG Bar Chart with avg line ─────────────────────────────────────────────

function BarChart({ ticks, metric }: { ticks: TickRow[]; metric: "revenue" | "qty" }) {
  if (ticks.length === 0) return null;

  const values = ticks.map((t) => metric === "revenue" ? t.totalRevenue : t.totalQtySold);
  const max    = Math.max(...values, 1);
  const avg    = values.reduce((a, b) => a + b, 0) / values.length;
  const W = 600, H = 140;
  const pad = { top: 12, bottom: 28, left: 10, right: 36 };
  const chartH = H - pad.top - pad.bottom;
  const barW   = (W - pad.left - pad.right) / ticks.length;
  const gapW   = Math.max(1, barW * 0.18);
  const netBarW = barW - gapW;

  function fmt(v: number) {
    if (metric === "revenue") return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v));
    return v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v));
  }

  const avgY = pad.top + chartH * (1 - avg / max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* Gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = pad.top + chartH * (1 - frac);
        return <line key={frac} x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#374151" strokeWidth="0.5" strokeDasharray="2 4" />;
      })}

      {/* Bars */}
      {ticks.map((t, i) => {
        const val  = values[i];
        const bH   = (val / max) * chartH;
        const x    = pad.left + i * barW + gapW / 2;
        const y    = pad.top + chartH - bH;
        const isMax = val === max;
        const fill = isMax ? "#10b981" : "#3b82f6";

        return (
          <g key={t.tickNumber}>
            <rect x={x} y={y} width={netBarW} height={bH} fill={fill} rx={2} opacity={0.8} />
            <text x={x + netBarW / 2} y={H - 4} textAnchor="middle" fontSize={8} fill="#6b7280">#{t.tickNumber}</text>
            {bH > 18 && (
              <text x={x + netBarW / 2} y={y - 3} textAnchor="middle" fontSize={7.5} fill={fill} fontWeight="bold">
                {fmt(val)}
              </text>
            )}
          </g>
        );
      })}

      {/* Avg line */}
      <line x1={pad.left} x2={W - pad.right} y1={avgY} y2={avgY} stroke="#6b7280" strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - pad.right + 2} y={avgY + 3} fontSize={7} fill="#6b7280">avg</text>
    </svg>
  );
}

// ─── Tick detail (collapsible) ────────────────────────────────────────────────

function TickDetail({ tick }: { tick: TickRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-800 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="text-xs font-mono text-gray-500 w-10 shrink-0">#{tick.tickNumber}</span>
        <span className="text-xs text-gray-600 shrink-0 w-28">
          {tick.processedAt
            ? new Date(tick.processedAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            : "—"}
        </span>
        <div className="flex-1 flex items-center gap-4 min-w-0">
          <span className="text-sm font-semibold text-emerald-400 font-mono whitespace-nowrap">
            ₴{formatNumber(Math.round(tick.totalRevenue))}
          </span>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {formatNumber(Math.round(tick.totalQtySold))} од.
          </span>
          <span className="text-xs text-gray-600 truncate">
            {tick.products.map((p) => p.productName).join(", ")}
          </span>
        </div>
        {open ? <ChevronUp size={13} className="text-gray-600 shrink-0" /> : <ChevronDown size={13} className="text-gray-600 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-3 pl-14">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800">
                <th className="text-left pb-1.5 font-normal">Товар</th>
                <th className="text-right pb-1.5 font-normal">Продано</th>
                <th className="text-right pb-1.5 font-normal">Виручка</th>
                <th className="text-right pb-1.5 font-normal">Ціна</th>
                <th className="text-right pb-1.5 font-normal">Насичення</th>
                <th className="text-right pb-1.5 font-normal">Вироблено</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {tick.products.map((p) => (
                <tr key={p.productId} className="text-gray-300">
                  <td className="py-1.5 text-white font-medium">{p.productName}</td>
                  <td className="py-1.5 text-right font-mono">{formatNumber(Math.round(p.qtySold))} {p.unit}</td>
                  <td className="py-1.5 text-right font-mono text-emerald-400">₴{formatNumber(Math.round(p.revenue))}</td>
                  <td className="py-1.5 text-right font-mono">₴{p.avgPrice.toFixed(2)}</td>
                  <td className={cn("py-1.5 text-right font-mono", satColor(p.saturationIndex))}>
                    {p.saturationIndex ? p.saturationIndex.toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono text-gray-500">
                    {p.globalProduced !== null ? formatNumber(Math.round(p.globalProduced)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Product Analytics Table ──────────────────────────────────────────────────

interface ProductAnalytics {
  productId  : string;
  name       : string;
  unit       : string;
  totalRev   : number;
  totalQty   : number;
  avgSat     : number;
  avgPrice   : number;
  priceFirst : number;
  priceLast  : number;
  revFirst   : number;
  revLast    : number;
}

function TrendIcon({ first, last }: { first: number; last: number }) {
  if (first <= 0 || last <= 0) return <Minus size={11} className="text-gray-600" />;
  const pct = ((last - first) / first) * 100;
  if (pct > 3) return <ArrowUpRight size={11} className="text-emerald-400" />;
  if (pct < -3) return <ArrowDownRight size={11} className="text-red-400" />;
  return <Minus size={11} className="text-gray-500" />;
}

function ProductAnalyticsTab({
  analytics,
  totalRevenue,
}: {
  analytics   : ProductAnalytics[];
  totalRevenue: number;
}) {
  const [sort, setSort] = useState<"rev" | "qty" | "sat" | "price">("rev");
  const [asc,  setAsc]  = useState(false);

  const sorted = useMemo(() => {
    return [...analytics].sort((a, b) => {
      let diff = 0;
      switch (sort) {
        case "rev":   diff = a.totalRev - b.totalRev; break;
        case "qty":   diff = a.totalQty - b.totalQty; break;
        case "sat":   diff = a.avgSat - b.avgSat; break;
        case "price": diff = a.avgPrice - b.avgPrice; break;
      }
      return asc ? diff : -diff;
    });
  }, [analytics, sort, asc]);

  function SortBtn({ k, label }: { k: typeof sort; label: string }) {
    return (
      <button
        onClick={() => { if (sort === k) setAsc((v) => !v); else { setSort(k); setAsc(false); } }}
        className={cn(
          "text-right pb-1.5 font-normal cursor-pointer hover:text-white transition-colors select-none",
          sort === k ? "text-white" : "text-gray-600",
        )}
      >
        {label}{sort === k ? (asc ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/50">
        <Package size={13} className="text-blue-400" />
        <span className="text-sm font-semibold text-white">Аналітика по товарах</span>
        <span className="text-xs text-gray-600 ml-auto">натисніть заголовок для сортування</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-gray-800 px-4">
              <th className="text-left pb-1.5 font-normal pl-4 pt-2">#</th>
              <th className="text-left pb-1.5 font-normal pt-2">Товар</th>
              <th className="text-right pb-1.5 font-normal pt-2">Частка</th>
              <SortBtn k="rev"   label="Виручка" />
              <SortBtn k="qty"   label="Продано" />
              <SortBtn k="price" label="Сер. ціна" />
              <SortBtn k="sat"   label="Насичення" />
              <th className="text-right pb-1.5 font-normal pt-2 pr-4">Тренд ціни</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {sorted.map((p, i) => {
              const share = totalRevenue > 0 ? (p.totalRev / totalRevenue) * 100 : 0;
              const satInfo = satLabel(p.avgSat);
              const priceChangePct = p.priceFirst > 0
                ? ((p.priceLast - p.priceFirst) / p.priceFirst) * 100
                : null;

              return (
                <tr key={p.productId} className="hover:bg-gray-800/20 transition-colors">
                  <td className="py-2.5 pl-4 text-gray-700">{i + 1}</td>
                  <td className="py-2.5 text-white font-medium min-w-[120px]">{p.name}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${share}%` }} />
                      </div>
                      <span className="text-gray-500 w-8 text-right">{share.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-mono text-emerald-400">₴{formatNumber(Math.round(p.totalRev))}</td>
                  <td className="py-2.5 text-right font-mono text-gray-300">
                    {formatNumber(Math.round(p.totalQty))} {p.unit}
                  </td>
                  <td className="py-2.5 text-right font-mono text-gray-300">
                    ₴{p.avgPrice > 0 ? p.avgPrice.toFixed(2) : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    {p.avgSat > 0 ? (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", satInfo.bg, satInfo.color)}>
                        {satInfo.label} {p.avgSat.toFixed(2)}
                      </span>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="py-2.5 text-right pr-4">
                    {p.priceFirst > 0 && p.priceLast > 0 ? (
                      <div className="flex items-center justify-end gap-1">
                        <TrendIcon first={p.priceFirst} last={p.priceLast} />
                        {priceChangePct !== null && Math.abs(priceChangePct) >= 1 && (
                          <span className={cn(
                            "text-[10px] font-mono",
                            priceChangePct > 0 ? "text-red-400" : "text-emerald-400",
                          )}>
                            {priceChangePct > 0 ? "+" : ""}{priceChangePct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = "overview" | "products" | "ticks";

export default function ProductionHistoryPage() {
  const [data,       setData]       = useState<HistoryData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<TabKey>("overview");
  const [metric,     setMetric]     = useState<"revenue" | "qty">("revenue");
  const [entFilter,  setEntFilter]  = useState("");
  const [prodFilter, setProdFilter] = useState("");
  const [ticksCount, setTicksCount] = useState(20);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      take: String(ticksCount),
      ...(entFilter  ? { entId    : entFilter  } : {}),
      ...(prodFilter ? { productId: prodFilter  } : {}),
    });
    fetch(`/api/production-history?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [ticksCount, entFilter, prodFilter]);

  useEffect(() => { load(); }, [load]);

  const s     = data?.summary;
  const ticks = data?.ticks ?? [];

  // ── Revenue trend (first → last tick) ────────────────────────────────────────
  const revenueTrend = ticks.length >= 2
    ? ((ticks[ticks.length - 1].totalRevenue - ticks[0].totalRevenue) / Math.max(1, ticks[0].totalRevenue)) * 100
    : null;

  // ── Per-product analytics (computed from ticks) ────────────────────────────
  const productAnalytics: ProductAnalytics[] = useMemo(() => {
    const map = new Map<string, {
      name: string; unit: string;
      totalRev: number; totalQty: number;
      satSum: number; satCount: number;
      priceHistory: number[];
      revHistory  : number[];
    }>();

    for (const tick of ticks) {
      for (const p of tick.products) {
        if (!map.has(p.productId)) {
          map.set(p.productId, { name: p.productName, unit: p.unit, totalRev: 0, totalQty: 0, satSum: 0, satCount: 0, priceHistory: [], revHistory: [] });
        }
        const e = map.get(p.productId)!;
        e.totalRev += p.revenue;
        e.totalQty += p.qtySold;
        if (p.saturationIndex > 0) { e.satSum += p.saturationIndex; e.satCount++; }
        if (p.avgPrice > 0) e.priceHistory.push(p.avgPrice);
        e.revHistory.push(p.revenue);
      }
    }

    return Array.from(map.entries()).map(([id, v]) => ({
      productId  : id,
      name       : v.name,
      unit       : v.unit,
      totalRev   : v.totalRev,
      totalQty   : v.totalQty,
      avgSat     : v.satCount > 0 ? v.satSum / v.satCount : 0,
      avgPrice   : v.priceHistory.length > 0 ? v.priceHistory.reduce((a, b) => a + b, 0) / v.priceHistory.length : 0,
      priceFirst : v.priceHistory[0]  ?? 0,
      priceLast  : v.priceHistory[v.priceHistory.length - 1] ?? 0,
      revFirst   : v.revHistory[0] ?? 0,
      revLast    : v.revHistory[v.revHistory.length - 1] ?? 0,
    })).sort((a, b) => b.totalRev - a.totalRev);
  }, [ticks]);

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview",  label: "Огляд",   icon: BarChart3   },
    { key: "products",  label: "Товари",  icon: Package     },
    { key: "ticks",     label: "Тіки",    icon: LayoutList  },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Factory size={22} className="text-emerald-400" />
          Історія виробництва
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Роздрібні продажі моїх підприємств по тіках</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {data && (
          <>
            <select
              value={entFilter}
              onChange={(e) => setEntFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">Всі підприємства</option>
              {data.myEnterprises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select
              value={prodFilter}
              onChange={(e) => setProdFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">Всі товари</option>
              {data.myProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        )}
        <select
          value={ticksCount}
          onChange={(e) => setTicksCount(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value={10}>10 тіків</option>
          <option value={20}>20 тіків</option>
          <option value={50}>50 тіків</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : !s || ticks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <Factory size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Немає даних про продажі</p>
          <p className="text-gray-600 text-xs mt-1">Дані з&apos;являться після перших тіків з роздрібними продажами</p>
        </div>
      ) : (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Виручка (всього)</p>
              <p className="text-xl font-bold text-emerald-400 font-mono">₴{formatNumber(Math.round(s.totalRevenue))}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-gray-600">за {s.tickCount} тіків</span>
                {revenueTrend !== null && Math.abs(revenueTrend) >= 1 && (
                  <span className={cn(
                    "flex items-center gap-0.5 text-[10px] font-medium",
                    revenueTrend > 0 ? "text-emerald-400" : "text-red-400",
                  )}>
                    {revenueTrend > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {revenueTrend > 0 ? "+" : ""}{revenueTrend.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Продано (всього)</p>
              <p className="text-xl font-bold text-white font-mono">{formatNumber(Math.round(s.totalQtySold))}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">одиниць</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Середня / тік</p>
              <p className="text-xl font-bold text-blue-400 font-mono">₴{formatNumber(Math.round(s.totalRevenue / s.tickCount))}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Кращий тік</p>
              <p className="text-xl font-bold text-amber-400 font-mono">#{s.bestTickNumber ?? "—"}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">₴{formatNumber(Math.round(s.bestTickRevenue))}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-800">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                  tab === key
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300",
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "overview" && (
            <div className="space-y-4">
              {/* Chart */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-emerald-400" />
                    Динаміка по тіках
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setMetric("revenue")}
                      className={cn("text-xs px-2.5 py-1 rounded-lg transition-colors",
                        metric === "revenue" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white")}
                    >
                      Виручка
                    </button>
                    <button
                      onClick={() => setMetric("qty")}
                      className={cn("text-xs px-2.5 py-1 rounded-lg transition-colors",
                        metric === "qty" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white")}
                    >
                      Кількість
                    </button>
                  </div>
                </div>
                <BarChart ticks={ticks} metric={metric} />
                <p className="text-[10px] text-gray-700 mt-1">— пунктирна лінія = середнє значення</p>
              </div>

              {/* Top products quick view */}
              {productAnalytics.length > 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                    <Package size={13} className="text-blue-400" />
                    <span className="text-sm font-semibold text-white">Топ товари</span>
                    <button
                      onClick={() => setTab("products")}
                      className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Деталі →
                    </button>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {productAnalytics.slice(0, 6).map((p, i) => {
                      const pct = s.totalRevenue > 0 ? (p.totalRev / s.totalRevenue) * 100 : 0;
                      const satInfo = p.avgSat > 0 ? satLabel(p.avgSat) : null;
                      return (
                        <div key={p.productId} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}</span>
                          <span className="text-sm text-white flex-1 min-w-0 truncate">{p.name}</span>
                          {satInfo && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border hidden sm:block", satInfo.bg, satInfo.color)}>
                              {satInfo.label}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                            {formatNumber(Math.round(p.totalQty))} {p.unit}
                          </span>
                          <span className="text-sm font-mono text-emerald-400 whitespace-nowrap">
                            ₴{formatNumber(Math.round(p.totalRev))}
                          </span>
                          <div className="w-16 shrink-0">
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-gray-600">{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "products" && (
            <ProductAnalyticsTab
              analytics={productAnalytics}
              totalRevenue={s.totalRevenue}
            />
          )}

          {tab === "ticks" && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <span className="text-sm font-semibold text-white">Деталі по тіках</span>
                <span className="text-xs text-gray-500 ml-auto">(натисніть щоб розгорнути)</span>
              </div>
              {[...ticks].reverse().map((t) => (
                <TickDetail key={t.tickNumber} tick={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
