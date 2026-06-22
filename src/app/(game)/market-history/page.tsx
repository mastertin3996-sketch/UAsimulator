"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  History, TrendingUp, TrendingDown, ArrowRight, Search,
  Loader2, ShoppingCart, Tag, BarChart3, DollarSign,
  ArrowUpDown, Building2, MapPin, ChevronDown,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "all" | "buyer" | "seller";

interface Tx {
  id          : string;
  transactedAt: string;
  productName : string;
  productUnit : string;
  basePrice   : number;
  cityName    : string;
  quantity    : number;
  pricePerUnit: number;
  totalPrice  : number;
  role        : "buyer" | "seller";
  counterparty: string;
}

interface TopProduct {
  id       : string;
  name     : string;
  buyCount : number;
  sellCount: number;
  spent    : number;
  earned   : number;
  total    : number;
}

interface DayPoint {
  date  : string;
  spent : number;
  earned: number;
  count : number;
}

interface Stats {
  totalSpent  : number;
  totalEarned : number;
  netCashFlow : number;
  dealCount   : number;
  topProducts : TopProduct[];
  byDay       : DayPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function DayChart({ data }: { data: DayPoint[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => Math.max(d.spent, d.earned)), 1);
  const last14 = data.slice(-14);

  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Обсяг за 14 днів</p>
      <div className="flex items-end gap-[3px] h-16">
        {last14.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col justify-end gap-[2px] group relative" title={`${fmtDate(d.date)}: -₴${formatNumber(Math.round(d.spent))} +₴${formatNumber(Math.round(d.earned))}`}>
            {d.earned > 0 && (
              <div
                className="w-full rounded-sm bg-emerald-600/70 group-hover:bg-emerald-500 transition-colors"
                style={{ height: `${(d.earned / maxVal) * 56}px` }}
              />
            )}
            {d.spent > 0 && (
              <div
                className="w-full rounded-sm bg-red-700/60 group-hover:bg-red-600 transition-colors"
                style={{ height: `${(d.spent / maxVal) * 56}px` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-600/70 rounded-sm inline-block" />Продажі</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-700/60 rounded-sm inline-block" />Закупки</span>
        <span className="ml-auto">{last14[0]?.date ? fmtDate(last14[0].date) : ""} — {last14[last14.length - 1]?.date ? fmtDate(last14[last14.length - 1].date) : ""}</span>
      </div>
    </div>
  );
}

// ─── Top products ─────────────────────────────────────────────────────────────

function TopProductsPanel({ products, role }: { products: TopProduct[]; role: Role }) {
  const sorted = [...products]
    .sort((a, b) => {
      if (role === "buyer")  return b.spent  - a.spent;
      if (role === "seller") return b.earned - a.earned;
      return b.total - a.total;
    })
    .slice(0, 8);

  const maxVal = Math.max(...sorted.map((p) => {
    if (role === "buyer")  return p.spent;
    if (role === "seller") return p.earned;
    return p.total;
  }), 1);

  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Топ товарів</p>
      <div className="space-y-2">
        {sorted.map((p) => {
          const val = role === "buyer" ? p.spent : role === "seller" ? p.earned : p.total;
          const pct = (val / maxVal) * 100;
          return (
            <div key={p.id}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-300 truncate max-w-[140px]">{p.name}</span>
                <span className="text-gray-500 font-mono ml-2">₴{formatNumber(Math.round(val))}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    role === "buyer" ? "bg-red-600/70" : role === "seller" ? "bg-emerald-600/70" : "bg-blue-600/70",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[9px] text-gray-700">
                {(role === "all" || role === "buyer")  && p.buyCount  > 0 && <span>{p.buyCount} закуп.</span>}
                {(role === "all" || role === "seller") && p.sellCount > 0 && <span>{p.sellCount} прод.</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: Tx }) {
  const isBuy    = tx.role === "buyer";
  const vsBase   = tx.basePrice > 0 ? tx.pricePerUnit / tx.basePrice : 1;
  const priceDiff = vsBase - 1;

  return (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors",
    )}>
      {/* Role icon */}
      <div className={cn(
        "mt-0.5 p-1.5 rounded-lg shrink-0",
        isBuy ? "bg-red-950/50" : "bg-emerald-950/50",
      )}>
        {isBuy
          ? <ShoppingCart size={12} className="text-red-400" />
          : <Tag          size={12} className="text-emerald-400" />
        }
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-white">{tx.productName}</span>
          <span className={cn("text-sm font-mono font-bold shrink-0", isBuy ? "text-red-400" : "text-emerald-400")}>
            {isBuy ? "−" : "+"}₴{formatNumber(Math.round(tx.totalPrice))}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
          <span className="font-mono">{formatNumber(tx.quantity)} {tx.productUnit}</span>
          <span>·</span>
          <span className="font-mono">₴{tx.pricePerUnit.toFixed(2)}/{tx.productUnit}</span>
          {Math.abs(priceDiff) >= 0.01 && (
            <>
              <span>·</span>
              <span className={cn("text-[10px]", priceDiff > 0 ? "text-red-400/70" : "text-emerald-400/70")}>
                {priceDiff > 0 ? "+" : ""}{(priceDiff * 100).toFixed(0)}% від базової
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-600 flex-wrap">
          <span className="flex items-center gap-0.5">
            <Building2 size={9} />
            {tx.counterparty}
          </span>
          <span className="flex items-center gap-0.5">
            <MapPin size={9} />
            {tx.cityName}
          </span>
          <span className="ml-auto text-gray-700">{fmtDateTime(tx.transactedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function MarketHistoryPage() {
  const [txs,       setTxs]       = useState<Tx[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [loadMore,  setLoadMore]  = useState(false);
  const [tab,       setTab]       = useState<"overview" | "list">("overview");
  const [role,      setRole]      = useState<Role>("all");
  const [search,    setSearch]    = useState("");
  const skipRef = useRef(0);

  const fetchData = useCallback(async (reset: boolean) => {
    const skip = reset ? 0 : skipRef.current;
    if (reset) setLoading(true); else setLoadMore(true);

    try {
      const params = new URLSearchParams({
        role,
        take: String(PAGE_SIZE),
        skip: String(skip),
      });
      const res  = await fetch(`/api/market/transactions?${params}`);
      const data = await res.json();

      const incoming: Tx[] = data.transactions ?? [];
      if (reset) {
        setTxs(incoming);
        skipRef.current = incoming.length;
        setStats(data.stats ?? null);
      } else {
        setTxs((prev) => [...prev, ...incoming]);
        skipRef.current += incoming.length;
      }
      setTotal(data.total ?? 0);
    } finally {
      if (reset) setLoading(false); else setLoadMore(false);
    }
  }, [role]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  const visible = useMemo(() => {
    if (!search.trim()) return txs;
    const q = search.toLowerCase();
    return txs.filter((t) =>
      t.productName.toLowerCase().includes(q) ||
      t.counterparty.toLowerCase().includes(q) ||
      t.cityName.toLowerCase().includes(q),
    );
  }, [txs, search]);

  const hasMore = skipRef.current < total && !search.trim();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <History size={22} className="text-blue-400" />
          Історія угод
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Всі ринкові транзакції вашої компанії</p>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-1">Всього зароблено</p>
            <p className="text-xl font-bold text-emerald-400 font-mono">₴{formatNumber(Math.round(stats.totalEarned))}</p>
          </div>
          <div className="rounded-xl border border-red-900/20 bg-red-950/10 px-4 py-3">
            <p className="text-[10px] text-red-500/70 uppercase tracking-wider mb-1">Всього витрачено</p>
            <p className="text-xl font-bold text-red-400 font-mono">₴{formatNumber(Math.round(stats.totalSpent))}</p>
          </div>
          <div className={cn(
            "rounded-xl border px-4 py-3",
            stats.netCashFlow >= 0 ? "border-blue-900/30 bg-blue-950/10" : "border-red-900/30 bg-red-950/10",
          )}>
            <p className={cn("text-[10px] uppercase tracking-wider mb-1", stats.netCashFlow >= 0 ? "text-blue-500/70" : "text-red-500/70")}>
              Net cash flow
            </p>
            <p className={cn("text-xl font-bold font-mono flex items-center gap-1", stats.netCashFlow >= 0 ? "text-blue-400" : "text-red-400")}>
              {stats.netCashFlow >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {stats.netCashFlow >= 0 ? "+" : ""}₴{formatNumber(Math.round(Math.abs(stats.netCashFlow)))}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Угод всього</p>
            <p className="text-xl font-bold text-white font-mono">{formatNumber(stats.dealCount)}</p>
            {stats.dealCount > 0 && (
              <p className="text-[10px] text-gray-600 mt-0.5">
                Сер. ₴{formatNumber(Math.round((stats.totalSpent + stats.totalEarned) / stats.dealCount))}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800">
        {([
          { key: "overview", label: "Огляд", icon: BarChart3     },
          { key: "list",     label: "Список", icon: ArrowUpDown  },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}

        {/* Role filter — always visible */}
        <div className="ml-auto flex items-center gap-1 pb-1">
          {(["all", "buyer", "seller"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={cn(
                "flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                role === r
                  ? r === "all" ? "bg-blue-700 text-white"
                    : r === "buyer" ? "bg-red-700 text-white"
                    : "bg-emerald-700 text-white"
                  : "bg-gray-800 text-gray-500 hover:text-white",
              )}
            >
              {r === "all"    && <><ArrowRight size={10} /> Всі</>}
              {r === "buyer"  && <><ShoppingCart size={10} /> Купівлі</>}
              {r === "seller" && <><Tag size={10} /> Продажі</>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : tab === "overview" ? (
        stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <DayChart data={stats.byDay} />
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <TopProductsPanel products={stats.topProducts} role={role} />
            </div>

            {/* Quick stats table */}
            <div className="md:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Зведення по товарах</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-600 border-b border-gray-800">
                      <th className="text-left pb-2 font-normal">#</th>
                      <th className="text-left pb-2 font-normal">Товар</th>
                      <th className="text-right pb-2 font-normal">Закуп. угод</th>
                      <th className="text-right pb-2 font-normal">Витрачено</th>
                      <th className="text-right pb-2 font-normal">Прод. угод</th>
                      <th className="text-right pb-2 font-normal">Зароблено</th>
                      <th className="text-right pb-2 font-normal">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topProducts.map((p, i) => {
                      const net = p.earned - p.spent;
                      return (
                        <tr key={p.id} className="border-b border-gray-800/40 last:border-0 hover:bg-gray-800/20 transition-colors">
                          <td className="py-2 pr-3 text-gray-700">{i + 1}</td>
                          <td className="py-2 text-white font-medium">{p.name}</td>
                          <td className="py-2 text-right text-gray-500 font-mono">{p.buyCount}</td>
                          <td className="py-2 text-right text-red-400 font-mono">₴{formatNumber(Math.round(p.spent))}</td>
                          <td className="py-2 text-right text-gray-500 font-mono">{p.sellCount}</td>
                          <td className="py-2 text-right text-emerald-400 font-mono">₴{formatNumber(Math.round(p.earned))}</td>
                          <td className={cn("py-2 text-right font-mono font-semibold", net >= 0 ? "text-blue-400" : "text-red-400")}>
                            {net >= 0 ? "+" : ""}₴{formatNumber(Math.round(net))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      ) : (
        /* List tab */
        <div className="space-y-3">
          {/* Search */}
          <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за товаром, компанією або містом…"
              className="bg-transparent text-sm text-white placeholder-gray-600 outline-none w-full"
            />
          </div>

          <div className="text-[10px] text-gray-700">
            {search.trim() ? `${visible.length} результатів` : `${total} угод · показано ${txs.length}`}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
              <DollarSign size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {search.trim() ? "Угод за запитом не знайдено" : "Угод ще немає"}
              </p>
              {search.trim() && (
                <button onClick={() => setSearch("")} className="text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors">
                  Скинути пошук
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                {visible.map((tx) => <TxRow key={tx.id} tx={tx} />)}
              </div>

              {hasMore && (
                <button
                  onClick={() => fetchData(false)}
                  disabled={loadMore}
                  className="w-full rounded-xl border border-dashed border-gray-800 py-4 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-600 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loadMore
                    ? <><Loader2 size={13} className="animate-spin" /> Завантаження…</>
                    : <><ChevronDown size={13} /> Завантажити ще ({total - skipRef.current})</>
                  }
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
