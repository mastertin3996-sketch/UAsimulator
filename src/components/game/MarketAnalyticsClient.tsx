"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, BarChart3, RefreshCw,
  ArrowUp, ArrowDown, Package, Loader2,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketProduct {
  productId:   string;
  productName: string;
  unit:        string;
  totalQty:    number;
  orderCount:  number;
  avgPrice:    number;
  basePrice:   number;
  priceVsBase: number;
}

interface MarketData {
  marketSummary: MarketProduct[];
  stats: {
    totalListings:   number;
    uniqueProducts:  number;
    weekTradeVolume: number;
    weekTradeCount:  number;
  };
}

interface PricePoint {
  date:     string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  volume:   number;
  count:    number;
}

interface PriceHistoryData {
  priceHistory: PricePoint[];
  basePrice:    number;
  orderBook:    { price: number; qty: number }[];
}

interface TrendProduct {
  productId:   string;
  name:        string;
  unit:        string;
  avgPrice:    number;
  basePrice:   number;
  priceVsBase: number;
  priceChange: number;
  volume:      number;
  tradeCount:  number;
}

interface TrendsData {
  trends: TrendProduct[];
  period: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priceDiffColor(ratio: number): string {
  if (ratio > 1.1)  return "text-emerald-400";
  if (ratio < 0.9)  return "text-red-400";
  return "text-gray-400";
}

function priceDiffLabel(ratio: number): string {
  const pct = ((ratio - 1) * 100).toFixed(1);
  return ratio >= 1 ? `+${pct}%` : `${pct}%`;
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({ data, basePrice }: { data: PricePoint[]; basePrice: number }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-600 text-sm border border-gray-800 rounded-xl">
        Немає даних про угоди
      </div>
    );
  }

  const W = 600, H = 160, PAD = { t: 12, r: 16, b: 28, l: 48 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const prices = data.map((d) => d.avgPrice);
  const allPrices = basePrice > 0 ? [...prices, basePrice] : prices;
  const minP = Math.min(...allPrices) * 0.97;
  const maxP = Math.max(...allPrices) * 1.03;
  const rangeP = maxP - minP || 1;

  const xOf = (i: number) => PAD.l + (i / (data.length - 1 || 1)) * innerW;
  const yOf = (v: number) => PAD.t + (1 - (v - minP) / rangeP) * innerH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(d.avgPrice).toFixed(1)}`)
    .join(" ");

  const area = `${line} L${xOf(data.length - 1).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${PAD.l.toFixed(1)},${(PAD.t + innerH).toFixed(1)} Z`;

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minP + f * rangeP);

  // X-axis labels (show up to 6)
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 200 }}>
      {/* Grid */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)}
            stroke="#1f2937" strokeWidth="1"
          />
          <text x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end" fill="#6b7280" fontSize="10">
            {v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Base price reference */}
      {basePrice > 0 && (
        <line
          x1={PAD.l} y1={yOf(basePrice)} x2={W - PAD.r} y2={yOf(basePrice)}
          stroke="#374151" strokeWidth="1" strokeDasharray="4 3"
        />
      )}

      {/* Area fill */}
      <path d={area} fill="rgba(16,185,129,0.06)" />

      {/* Price line */}
      {data.length > 1 && (
        <path d={line} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
      )}

      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(d.avgPrice)} r="3" fill="#10b981" />
      ))}

      {/* X-axis labels */}
      {xLabels.map((d, i) => {
        const idx = data.indexOf(d);
        return (
          <text key={i} x={xOf(idx)} y={H - 4} textAnchor="middle" fill="#6b7280" fontSize="9">
            {d.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Tab 1: Active Market ─────────────────────────────────────────────────────

function MarketTab({ data, loading }: { data: MarketData | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (!data) return <div className="text-center py-16 text-gray-500">Помилка завантаження</div>;

  const { marketSummary, stats } = data;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Унікальних товарів", value: stats.uniqueProducts, color: "text-white" },
          { label: "Активних оферт",     value: stats.totalListings,  color: "text-violet-400" },
          { label: "Обсяг (7 днів)",     value: formatNumber(stats.weekTradeVolume), color: "text-emerald-400" },
          { label: "Угод за 7 днів",     value: formatNumber(stats.weekTradeCount),  color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{label}</p>
            <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Products table */}
      {marketSummary.length === 0 ? (
        <div className="text-center py-16 text-gray-600 border border-gray-800 rounded-xl text-sm">
          Активних оферт на ринку немає
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Товар</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium whitespace-nowrap">Середня ціна</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium whitespace-nowrap">Базова ціна</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium whitespace-nowrap">% до бази</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Кількість</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Оферт</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {marketSummary.map((p) => (
                <tr key={p.productId} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{p.productName}</p>
                    <p className="text-gray-600 text-xs">{p.unit}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {p.avgPrice.toFixed(2)} ₴
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500">
                    {p.basePrice > 0 ? `${p.basePrice.toFixed(2)} ₴` : "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono font-semibold", priceDiffColor(p.priceVsBase))}>
                    {p.basePrice > 0 ? priceDiffLabel(p.priceVsBase) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-violet-400">
                    {formatNumber(p.totalQty)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {p.orderCount}
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

// ─── Tab 2: Price History ─────────────────────────────────────────────────────

function PriceHistoryTab({ marketProducts }: { marketProducts: MarketProduct[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [history, setHistory]       = useState<PriceHistoryData | null>(null);
  const [loading, setLoading]       = useState(false);

  const allProducts = marketProducts;

  useEffect(() => {
    if (allProducts.length > 0 && !selectedId) {
      setSelectedId(allProducts[0].productId);
    }
  }, [allProducts, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setHistory(null);
    fetch(`/api/analytics/price-history?productId=${selectedId}`)
      .then((r) => r.json())
      .then((d: PriceHistoryData) => setHistory(d))
      .catch(() => setHistory(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = allProducts.find((p) => p.productId === selectedId);

  return (
    <div className="space-y-5">
      {/* Product selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400 whitespace-nowrap">Товар:</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
        >
          {allProducts.map((p) => (
            <option key={p.productId} value={p.productId}>{p.productName}</option>
          ))}
        </select>
        {selected && (
          <span className="text-xs text-gray-500">
            Базова ціна: <span className="text-gray-300">{selected.basePrice.toFixed(2)} ₴/{selected.unit}</span>
          </span>
        )}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !history ? (
        <div className="text-center py-16 text-gray-600 border border-gray-800 rounded-xl text-sm">
          Оберіть товар для перегляду
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
              Середня ціна угод (₴/{selected?.unit ?? "шт"}) — за 60 днів
            </p>
            <LineChart data={history.priceHistory} basePrice={history.basePrice} />
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 bg-emerald-500" /> Середня ціна
              </span>
              {history.basePrice > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-0.5 border-t border-dashed border-gray-600" /> Базова ціна
                </span>
              )}
            </div>
          </div>

          {/* Stats summary */}
          {history.priceHistory.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(() => {
                const pts = history.priceHistory;
                const last = pts[pts.length - 1];
                const totalVol = pts.reduce((s, d) => s + d.volume, 0);
                const avgPriceAll = pts.reduce((s, d) => s + d.avgPrice, 0) / pts.length;
                const minAll = Math.min(...pts.map((d) => d.minPrice));
                const maxAll = Math.max(...pts.map((d) => d.maxPrice));
                return [
                  { label: "Остання ціна",   value: `${last.avgPrice.toFixed(2)} ₴`,   color: "text-white" },
                  { label: "Середня (60д)",  value: `${avgPriceAll.toFixed(2)} ₴`,     color: "text-gray-300" },
                  { label: "Мін / Макс",     value: `${minAll.toFixed(2)} / ${maxAll.toFixed(2)}`, color: "text-gray-300" },
                  { label: "Обсяг угод",     value: formatNumber(totalVol),             color: "text-violet-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{label}</p>
                    <p className={cn("text-base font-bold font-mono", color)}>{value}</p>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Order book */}
          {history.orderBook.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                Активні оферти (до 20) — від найдешевшого
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {history.orderBook.map((o, i) => {
                  const ratio = history.basePrice > 0 ? o.price / history.basePrice : 1;
                  const barW = Math.min(100, (o.qty / (history.orderBook[0]?.qty || 1)) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-white w-16 shrink-0">{o.price.toFixed(2)} ₴</span>
                      <span className={cn("w-14 shrink-0 font-medium", priceDiffColor(ratio))}>
                        {priceDiffLabel(ratio)}
                      </span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${barW}%` }} />
                      </div>
                      <span className="text-gray-400 w-20 text-right shrink-0">{formatNumber(o.qty)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Trends ────────────────────────────────────────────────────────────

function TrendsTab() {
  const [data, setData]     = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/trends")
      .then((r) => r.json())
      .then((d: TrendsData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (!data || data.trends.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 border border-gray-800 rounded-xl text-sm">
        Недостатньо торгових даних за останні 30 днів
      </div>
    );
  }

  const risers = [...data.trends].filter((t) => t.priceChange > 0.01).sort((a, b) => b.priceChange - a.priceChange).slice(0, 8);
  const fallers = [...data.trends].filter((t) => t.priceChange < -0.01).sort((a, b) => a.priceChange - b.priceChange).slice(0, 8);
  const flat   = [...data.trends].filter((t) => Math.abs(t.priceChange) <= 0.01).slice(0, 8);

  function TrendRow({ t }: { t: TrendProduct }) {
    const pct    = (t.priceChange * 100).toFixed(1);
    const isUp   = t.priceChange > 0.01;
    const isDown = t.priceChange < -0.01;
    return (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/20 transition-colors">
        <div className="w-6 shrink-0">
          {isUp   && <ArrowUp   size={14} className="text-emerald-400" />}
          {isDown && <ArrowDown size={14} className="text-red-400" />}
          {!isUp && !isDown && <Minus size={14} className="text-gray-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium truncate">{t.name}</p>
          <p className="text-xs text-gray-500">{t.unit} · {formatNumber(t.volume)} одиниць</p>
        </div>
        <div className="text-right shrink-0">
          <span className={cn(
            "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full",
            isUp   ? "text-emerald-400 bg-emerald-950/60 border border-emerald-900/50"
            : isDown ? "text-red-400 bg-red-950/60 border border-red-900/50"
            : "text-gray-500 bg-gray-800 border border-gray-700",
          )}>
            {isUp && "+"}{pct}%
          </span>
        </div>
        <div className="text-right shrink-0 w-28">
          <p className="text-sm font-mono text-white">{t.avgPrice.toFixed(2)} ₴</p>
          {t.basePrice > 0 && (
            <p className={cn("text-xs font-mono", priceDiffColor(t.priceVsBase))}>
              {priceDiffLabel(t.priceVsBase)} до бази
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-600">Зміна ціни порівняно з першою половиною угод за 30 днів. Товари з обсягом &gt; 0.</p>

      {risers.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Зростання ціни</h3>
            <span className="text-xs text-gray-600">({risers.length})</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {risers.map((t) => <TrendRow key={t.productId} t={t} />)}
          </div>
        </div>
      )}

      {fallers.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <TrendingDown size={14} className="text-red-400" />
            <h3 className="text-sm font-semibold text-white">Падіння ціни</h3>
            <span className="text-xs text-gray-600">({fallers.length})</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {fallers.map((t) => <TrendRow key={t.productId} t={t} />)}
          </div>
        </div>
      )}

      {flat.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <Minus size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-white">Стабільні ціни</h3>
            <span className="text-xs text-gray-600">({flat.length})</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {flat.map((t) => <TrendRow key={t.productId} t={t} />)}
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
  const [tab,     setTab]     = useState<"market" | "prices" | "trends">("market");

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

  const tabs = [
    { key: "market"  as const, label: "Активний ринок", icon: "📊" },
    { key: "prices"  as const, label: "Ціни",           icon: "📈" },
    { key: "trends"  as const, label: "Тренди",         icon: "🔥" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 size={22} className="text-violet-400" />
            Аналітика ринку
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Активні оферти, ціни та тренди торгівлі
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

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 w-fit">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === key
                ? "bg-gray-700 text-white shadow"
                : "text-gray-400 hover:text-white",
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "market" && (
        loading && !data
          ? <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          : !data
          ? <div className="text-center py-20 text-gray-500">
              <Loader2 className="animate-spin mx-auto mb-3 text-gray-600" size={28} />
              Завантаження...
            </div>
          : <MarketTab data={data} loading={loading} />
      )}

      {tab === "prices" && (
        loading && !data
          ? <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-52 w-full" />
            </div>
          : <PriceHistoryTab marketProducts={data?.marketSummary ?? []} />
      )}

      {tab === "trends" && <TrendsTab />}
    </div>
  );
}
