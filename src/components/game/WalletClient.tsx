"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BalancePoint { tick: number; balance: number }

interface Txn {
  id          : string;
  type        : string;
  amount      : number;
  balanceAfter: number;
  description : string | null;
  createdAt   : string;
  tickNumber  : null;
}

interface Stats {
  avgIncomePerTick : number;
  avgExpensePerTick: number;
  avgNetPerTick    : number;
}

interface WalletData {
  balanceHistory: BalancePoint[];
  latestTxns    : Txn[];
  stats         : Stats;
}

// ─── Transaction metadata ──────────────────────────────────────────────────

const TXN_META: Record<string, { label: string; icon: string }> = {
  SALARY_PAYMENT    : { label: "Зарплата",               icon: "👷" },
  MARKET_SALE       : { label: "Продаж ринок",           icon: "💰" },
  MARKET_PURCHASE   : { label: "Покупка ринок",          icon: "🛒" },
  TAX_PAYMENT       : { label: "Податок",                icon: "🏛" },
  LOAN_PAYMENT      : { label: "Кредит",                 icon: "🏦" },
  LOAN_DISBURSEMENT : { label: "Отримано кредит",        icon: "🏦" },
  EQUIPMENT_PURCHASE: { label: "Обладнання",             icon: "🔧" },
  LICENSE_PURCHASE  : { label: "Ліцензія",               icon: "📋" },
  TRAINING_PAYMENT  : { label: "Навчання",               icon: "🎓" },
  RESEARCH_PAYMENT  : { label: "Дослідження",            icon: "🔬" },
  LAND_PURCHASE     : { label: "Земля",                  icon: "🌍" },
  ENTERPRISE_CREATION: { label: "Відкриття підприємства", icon: "🏗" },
};

function getTxnMeta(type: string): { label: string; icon: string } {
  return TXN_META[type] ?? { label: type, icon: "💳" };
}

// ─── Balance Line Chart ───────────────────────────────────────────────────

function BalanceChart({ data }: { data: BalancePoint[] }) {
  if (data.length < 2) return null;

  const W = 560, H = 90, pad = 10;
  const balances = data.map((d) => d.balance);
  const minB  = Math.min(...balances);
  const maxB  = Math.max(...balances);
  const range = maxB - minB || 1;

  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((d.balance - minB) / range) * (H - pad * 2);
    return { x, y, ...d };
  });

  const polyline  = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaClose = `${pts[pts.length - 1].x},${H} ${pts[0].x},${H}`;
  const last      = pts[pts.length - 1];
  const isUp      = data[data.length - 1].balance >= data[0].balance;
  const color     = isUp ? "#10b981" : "#ef4444";

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <p className="text-xs text-gray-500 mb-2">
        Баланс GC — останні {data.length} тіків
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-20"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="walletGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0"    />
          </linearGradient>
        </defs>
        <polygon
          points={`${polyline} ${areaClose}`}
          fill="url(#walletGrad)"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last.x} cy={last.y} r="3.5" fill={color} />
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-700">
        <span>Тік #{data[0].tick}</span>
        <span className={cn("font-mono text-xs font-semibold", isUp ? "text-emerald-400" : "text-red-400")}>
          {formatNumber(Math.round(data[data.length - 1].balance))} GC
        </span>
        <span>Тік #{data[data.length - 1].tick}</span>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sign, color, borderColor, bgColor,
}: {
  label: string; value: number; sign?: "+" | "−" | "";
  color: string; borderColor: string; bgColor: string;
}) {
  const displaySign = sign === undefined ? (value >= 0 ? "+" : "") : sign;
  return (
    <div className={cn("rounded-xl border px-4 py-3", borderColor, bgColor)}>
      <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={cn("font-mono font-semibold text-base", color)}>
        {displaySign}{formatNumber(Math.round(value))}
      </p>
      <p className="text-[10px] text-gray-600 mt-0.5">GC / тік</p>
    </div>
  );
}

// ─── Loading Skeletons ────────────────────────────────────────────────────

function WalletSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function WalletClient() {
  const [data,    setData]    = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: WalletData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <WalletSkeleton />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-red-400 text-sm">
        Не вдалося завантажити дані гаманця{error ? `: ${error}` : ""}
      </div>
    );
  }

  const { balanceHistory, latestTxns, stats } = data;
  const net = stats.avgNetPerTick;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity size={22} className="text-emerald-400" />
          Гаманець
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Середні показники за тік та останні транзакції
        </p>
      </div>

      {/* ── 1. Stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Середній дохід / тік"
          value={stats.avgIncomePerTick}
          sign="+"
          color="text-emerald-400"
          borderColor="border-emerald-900/40"
          bgColor="bg-emerald-950/15"
        />
        <StatCard
          label="Середні витрати / тік"
          value={stats.avgExpensePerTick}
          sign="−"
          color="text-red-400"
          borderColor="border-red-900/40"
          bgColor="bg-red-950/15"
        />
        <StatCard
          label="Середній прибуток / тік"
          value={net}
          sign={net >= 0 ? "+" : ""}
          color={net >= 0 ? "text-blue-400" : "text-red-400"}
          borderColor={net >= 0 ? "border-blue-900/40" : "border-red-900/40"}
          bgColor={net >= 0 ? "bg-blue-950/15" : "bg-red-950/10"}
        />
      </div>

      {/* ── 2. Balance history chart ──────────────────────────────────────── */}
      {balanceHistory.length >= 2 && (
        <BalanceChart data={balanceHistory} />
      )}

      {/* ── 3. Recent transactions list ───────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <TrendingUp size={14} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-400">
            Останні транзакції
          </h2>
          <span className="ml-auto text-[10px] text-gray-700 font-mono">
            до {latestTxns.length} записів
          </span>
        </div>

        {latestTxns.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">
            Транзакцій ще немає
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {latestTxns.map((t) => {
              const meta    = getTxnMeta(t.type);
              const isInc   = t.amount > 0;
              const amtCls  = isInc ? "text-emerald-400" : "text-red-400";
              const date    = new Date(t.createdAt).toLocaleString("uk-UA", {
                day: "2-digit", month: "2-digit",
                hour: "2-digit", minute: "2-digit",
              });

              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20 transition-colors"
                >
                  {/* Icon */}
                  <span className="text-lg shrink-0 w-7 text-center leading-none" aria-hidden>
                    {meta.icon}
                  </span>

                  {/* Type + description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-300 truncate">
                      {meta.label}
                    </p>
                    {t.description && (
                      <p className="text-[11px] text-gray-600 truncate mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>

                  {/* Date */}
                  <span className="text-[10px] text-gray-700 shrink-0 tabular-nums hidden sm:block">
                    {date}
                  </span>

                  {/* Amount + balance after */}
                  <div className="text-right shrink-0 ml-2">
                    <p className={cn("text-xs font-mono font-semibold", amtCls)}>
                      {isInc ? "+" : ""}{formatNumber(Math.round(t.amount))} GC
                    </p>
                    <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                      <TrendingDown size={8} className="inline mr-0.5 text-gray-700" />
                      {formatNumber(Math.round(t.balanceAfter))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
