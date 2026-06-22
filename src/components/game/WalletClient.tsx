"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet, Coins, CircleDollarSign, ArrowDownToLine,
  Clock, CheckCircle2, XCircle, Loader2, AlertCircle,
  ShieldCheck, Info, Copy, Check, TrendingUp, TrendingDown, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const PC_TO_USD        = 0.01;
const MIN_PC           = 100;
const PAYOUT_METHODS   = ["USDT_TRC20", "USDT_ERC20", "PAYPAL"] as const;
type  PayoutMethod     = typeof PAYOUT_METHODS[number];

const METHOD_META: Record<PayoutMethod, { label: string; placeholder: string; hint: string }> = {
  USDT_TRC20: {
    label      : "USDT (TRC-20 / Tron)",
    placeholder: "Адреса Tron (починається з T...)",
    hint       : "34 символи, починається з 'T'",
  },
  USDT_ERC20: {
    label      : "USDT (ERC-20 / Ethereum)",
    placeholder: "0x...",
    hint       : "42 символи, починається з '0x'",
  },
  PAYPAL: {
    label      : "PayPal",
    placeholder: "paypal@example.com",
    hint       : "Email-адреса PayPal акаунту",
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface WithdrawalRow {
  id           : string;
  amountPC     : number;
  amountUSD    : number;
  payoutMethod : PayoutMethod;
  payoutAddress: string;
  status       : "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED";
  adminNote    : string | null;
  createdAt    : string;
  processedAt  : string | null;
}

interface WalletData {
  wallet     : { gameCash: number; premiumCoin: number };
  stats      : { totalWithdrawnPC: number; totalWithdrawnUSD: number; pendingCount: number };
  withdrawals: WithdrawalRow[];
}

// ─── GC activity types ───────────────────────────────────────────────────────

interface BalancePoint { tick: number; balance: number }
interface GcTxn {
  id: string; type: string; amount: number; balanceAfter: number;
  description: string | null; createdAt: string; tickNumber: number | null;
}
interface GcStats { avgIncomePerTick: number; avgExpensePerTick: number; avgNetPerTick: number; ticksAnalyzed: number }
interface GcData { balanceHistory: BalancePoint[]; latestTxns: GcTxn[]; stats: GcStats }

// ─── TXN labels ──────────────────────────────────────────────────────────────

const TXN_LABELS: Record<string, { label: string; color: string }> = {
  SALARY         : { label: "Зарплата",         color: "text-amber-400"  },
  RENT           : { label: "Оренда",           color: "text-orange-400" },
  PRODUCTION     : { label: "Виробництво",      color: "text-blue-400"   },
  RETAIL_SALE    : { label: "Роздрібний продаж",color: "text-emerald-400"},
  MARKET_PURCHASE: { label: "Закупівля",        color: "text-red-400"    },
  MARKET_SALE    : { label: "Продаж (ринок)",   color: "text-green-400"  },
  RESEARCH       : { label: "Дослідження",      color: "text-violet-400" },
  DEPOSIT        : { label: "Поповнення",       color: "text-emerald-400"},
  WITHDRAWAL     : { label: "Виведення",        color: "text-red-400"    },
  TRANSFER       : { label: "Трансфер",         color: "text-gray-400"   },
  CORPORATE_TAX  : { label: "Корп. податок",    color: "text-yellow-400" },
  IMPORT_DUTY    : { label: "Митний збір",      color: "text-sky-400"    },
  MAINTENANCE    : { label: "Обслуговування",   color: "text-orange-300" },
};

// ─── Balance Sparkline ────────────────────────────────────────────────────────

function BalanceSparkline({ data }: { data: BalancePoint[] }) {
  if (data.length < 2) return null;
  const W = 560, H = 80, pad = 8;
  const balances = data.map((d) => d.balance);
  const minB = Math.min(...balances);
  const maxB = Math.max(...balances);
  const range = maxB - minB || 1;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((d.balance - minB) / range) * (H - pad * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const areaClose = `${pts[pts.length - 1].split(",")[0]},${H} ${pts[0].split(",")[0]},${H}`;
  const lastPt = pts[pts.length - 1].split(",");
  const isUp = data[data.length - 1].balance >= data[0].balance;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <p className="text-xs text-gray-500 mb-2">GC баланс — останні {data.length} тіків</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`${polyline} ${areaClose}`} fill="url(#gcGrad)" />
        <polyline points={polyline} fill="none" stroke={isUp ? "#10b981" : "#ef4444"} strokeWidth="1.5" />
        <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={isUp ? "#10b981" : "#ef4444"} />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-700 mt-1">
        <span>Тік #{data[0].tick}</span>
        <span className={cn("font-mono text-xs font-semibold", isUp ? "text-emerald-400" : "text-red-400")}>
          {formatNumber(Math.round(data[data.length - 1].balance))} GC
        </span>
        <span>Тік #{data[data.length - 1].tick}</span>
      </div>
    </div>
  );
}

// ─── GC Activity Panel ────────────────────────────────────────────────────────

function GcActivityPanel() {
  const [gc, setGc] = useState<GcData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/wallet").then((r) => r.json()).then(setGc).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!gc) return null;

  const net = gc.stats.avgNetPerTick;

  return (
    <div className="space-y-5">
      {/* Per-tick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><TrendingUp size={10} className="text-emerald-400" /> Дохід/тік</p>
          <p className="font-mono text-emerald-400 font-semibold">+{formatNumber(gc.stats.avgIncomePerTick)}</p>
          <p className="text-[10px] text-gray-600">GC (сер. {gc.stats.ticksAnalyzed} тіків)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><TrendingDown size={10} className="text-red-400" /> Витрати/тік</p>
          <p className="font-mono text-red-400 font-semibold">−{formatNumber(gc.stats.avgExpensePerTick)}</p>
          <p className="text-[10px] text-gray-600">GC</p>
        </div>
        <div className={cn("rounded-xl px-4 py-3 border", net >= 0 ? "bg-emerald-950/20 border-emerald-900/40" : "bg-red-950/20 border-red-900/40")}>
          <p className="text-[10px] text-gray-500 mb-1">Нетто/тік</p>
          <p className={cn("font-mono font-semibold", net >= 0 ? "text-emerald-400" : "text-red-400")}>
            {net >= 0 ? "+" : ""}{formatNumber(net)}
          </p>
          <p className="text-[10px] text-gray-600">GC</p>
        </div>
      </div>

      {/* Sparkline */}
      {gc.balanceHistory.length >= 2 && <BalanceSparkline data={gc.balanceHistory} />}

      {/* Recent transactions */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
          <Activity size={13} className="text-gray-500" />
          <p className="text-xs font-semibold text-gray-400">Останні транзакції GC</p>
        </div>
        <div className="divide-y divide-gray-800/50">
          {gc.latestTxns.map((t) => {
            const lbl = TXN_LABELS[t.type] ?? { label: t.type, color: "text-gray-400" };
            const isIncome = t.amount > 0;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20 transition-colors">
                <div className="w-24 shrink-0">
                  <span className={cn("text-[11px] font-medium", lbl.color)}>{lbl.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 truncate">{t.description ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("text-xs font-mono font-semibold", isIncome ? "text-emerald-400" : "text-red-400")}>
                    {isIncome ? "+" : ""}{formatNumber(Math.round(t.amount))} GC
                  </p>
                  <p className="text-[10px] text-gray-600 font-mono">{formatNumber(Math.round(t.balanceAfter))}</p>
                </div>
                <div className="text-[10px] text-gray-700 shrink-0 w-10 text-right">
                  {t.tickNumber !== null ? `#${t.tickNumber}` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  PENDING   : { label: "Очікує",     color: "bg-amber-950 text-amber-400",   icon: Clock         },
  PROCESSING: { label: "Обробляється", color: "bg-blue-950 text-blue-400",   icon: Loader2       },
  APPROVED  : { label: "Виплачено",  color: "bg-emerald-950 text-emerald-400", icon: CheckCircle2 },
  REJECTED  : { label: "Відхилено",  color: "bg-red-950 text-red-400",       icon: XCircle       },
};

function StatusBadge({ status }: { status: WithdrawalRow["status"] }) {
  const cfg  = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium", cfg.color)}>
      <Icon size={11} className={status === "PROCESSING" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-1 text-gray-600 hover:text-gray-400 transition-colors">
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Withdraw form ────────────────────────────────────────────────────────────

function WithdrawForm({ pcBalance, onSuccess }: { pcBalance: number; onSuccess: () => void }) {
  const [amount,  setAmount]  = useState<string>("");
  const [method,  setMethod]  = useState<PayoutMethod>("USDT_TRC20");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  const numAmount  = parseFloat(amount) || 0;
  const usdPreview = (numAmount * PC_TO_USD).toFixed(2);
  const canSubmit  = numAmount >= MIN_PC && numAmount <= pcBalance && address.trim().length > 0;

  const submit = async () => {
    setError(""); setSuccess("");
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/economy/withdraw", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ amountPC: numAmount, payoutMethod: method, payoutAddress: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Помилка");
      setSuccess(`Заявку подано! Сума: ${numAmount} PC ($${usdPreview})`);
      setAmount(""); setAddress("");
      setTimeout(onSuccess, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  };

  const meta = METHOD_META[method];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowDownToLine size={17} className="text-emerald-400" />
          Вивести PremiumCoin
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Rate info */}
        <div className="flex items-start gap-2.5 bg-blue-950/30 border border-blue-900/50 rounded-xl px-4 py-3 text-sm">
          <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="text-blue-300 space-y-0.5">
            <p className="font-medium">Курс: 1 PC = ${PC_TO_USD} · Мінімум: {MIN_PC} PC = ${(MIN_PC * PC_TO_USD).toFixed(2)}</p>
            <p className="text-blue-400 text-xs">Заявки обробляються адміністратором протягом 24–72 годин</p>
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-400 font-medium">Кількість PremiumCoin</label>
          <div className="relative">
            <input
              type="number"
              min={MIN_PC}
              max={pcBalance}
              step={10}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Мін. ${MIN_PC} PC`}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-3 pr-28
                         focus:outline-none focus:border-emerald-500 transition-colors [appearance:textfield]"
            />
            <button
              type="button"
              onClick={() => setAmount(String(Math.floor(pcBalance)))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-500 hover:text-emerald-400 font-medium"
            >
              Весь баланс
            </button>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Доступно: <span className="text-violet-400 font-mono font-semibold">{pcBalance.toFixed(4)} PC</span></span>
            {numAmount > 0 && (
              <span className={cn("font-mono", numAmount > pcBalance ? "text-red-400" : "text-emerald-400")}>
                ≈ ${usdPreview}
              </span>
            )}
          </div>
          {numAmount > 0 && numAmount < MIN_PC && (
            <p className="text-xs text-red-400">Мінімальна сума: {MIN_PC} PC</p>
          )}
          {numAmount > pcBalance && (
            <p className="text-xs text-red-400">Недостатньо PC на балансі</p>
          )}
        </div>

        {/* Payout method */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-400 font-medium">Спосіб виведення</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYOUT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setAddress(""); }}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-xs font-medium transition-all text-center",
                  method === m
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-400"
                    : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-white",
                )}
              >
                {METHOD_META[m].label}
              </button>
            ))}
          </div>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-400 font-medium">{meta.label} — адреса</label>
          <input
            type={method === "PAYPAL" ? "email" : "text"}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={meta.placeholder}
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-3
                       focus:outline-none focus:border-emerald-500 transition-colors font-mono"
          />
          <p className="text-xs text-gray-600">{meta.hint}</p>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-2 bg-amber-950/20 border border-amber-900/40 rounded-xl px-4 py-3">
          <ShieldCheck size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80">
            PC списуються одразу при поданні заявки. У разі відмови — повертаються автоматично.
            Перевірте адресу перед відправкою, помилкові транзакції незворотні.
          </p>
        </div>

        {error   && <p className="flex items-center gap-1.5 text-sm text-red-400"><AlertCircle size={14} />{error}</p>}
        {success && <p className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 size={14} />{success}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit || loading}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed
                     text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Обробка…</>
            : <><ArrowDownToLine size={15} /> Подати заявку на виведення</>
          }
        </button>
      </CardContent>
    </Card>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

function HistoryTable({ rows }: { rows: WithdrawalRow[] }) {
  if (rows.length === 0) return (
    <Card>
      <CardContent className="py-12 text-center text-gray-500 text-sm">
        Заявок на виведення ще немає
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Історія виведень</CardTitle></CardHeader>
      <CardContent className="pt-0 px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 border-b border-gray-800">
              <tr>
                {["Дата", "Сума", "USD", "Метод", "Адреса", "Статус", "Примітка адміна"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wide font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3 font-mono text-violet-400 font-semibold whitespace-nowrap">
                    {r.amountPC.toFixed(2)} PC
                  </td>
                  <td className="px-4 py-3 font-mono text-emerald-400 whitespace-nowrap">
                    ${r.amountUSD.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {METHOD_META[r.payoutMethod]?.label ?? r.payoutMethod}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-[160px] truncate">
                    {r.payoutAddress}
                    <CopyBtn text={r.payoutAddress} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                    {r.adminNote ?? <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WalletClient() {
  const [data,    setData]    = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"withdraw" | "activity">("withdraw");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/economy/withdraw-history");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-96 w-full" />
    </div>
  );

  const d = data!;
  const pc = d.wallet.premiumCoin;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet size={22} className="text-violet-400" /> Гаманець
        </h1>
        <p className="text-gray-500 text-sm mt-1">Баланс, виведення PremiumCoin та історія транзакцій</p>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* PC balance */}
        <div className="rounded-xl border border-violet-800/50 bg-violet-950/20 px-5 py-4 col-span-1 sm:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Coins size={16} className="text-violet-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wide">PremiumCoin</p>
          </div>
          <p className="text-4xl font-bold font-mono text-violet-300">{pc.toFixed(4)}</p>
          <p className="text-sm text-gray-500 mt-1">≈ ${(pc * PC_TO_USD).toFixed(2)} USD</p>
          {d.stats.pendingCount > 0 && (
            <p className="mt-2 text-xs text-amber-400 flex items-center gap-1">
              <Clock size={11} /> {d.stats.pendingCount} активна заявка на виведення
            </p>
          )}
        </div>

        {/* GC balance */}
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CircleDollarSign size={16} className="text-amber-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wide">GameCash</p>
          </div>
          <p className="text-2xl font-bold font-mono text-amber-300">{formatNumber(d.wallet.gameCash)}</p>
          <p className="text-xs text-gray-600 mt-1">Ігрова валюта</p>
        </div>
      </div>

      {/* Stats */}
      {(d.stats.totalWithdrawnPC > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs text-gray-500">Виведено всього PC</p>
            <p className="text-lg font-bold font-mono text-violet-400 mt-1">{d.stats.totalWithdrawnPC.toFixed(2)} PC</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs text-gray-500">Виведено всього USD</p>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-1">${d.stats.totalWithdrawnUSD.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 w-fit">
        {([
          { id: "withdraw", label: "Виведення PC",  icon: ArrowDownToLine },
          { id: "activity", label: "Активність GC", icon: Activity        },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors",
              tab === id ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white"
            )}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* GC Activity tab */}
      {tab === "activity" && <GcActivityPanel />}

      {/* Withdrawal tab content */}
      {tab === "withdraw" && <>

      {/* How to earn PC */}
      {pc === 0 && d.withdrawals.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4 space-y-2">
          <p className="text-sm font-semibold text-white">Як заробити PremiumCoin?</p>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-2"><span className="text-yellow-400 shrink-0">★</span>Топ-3 у тижневому рейтингу компаній</li>
            <li className="flex items-start gap-2"><span className="text-blue-400 shrink-0">★</span>Продаж товарів якістю 9–10 через роздрібні магазини NPC</li>
            <li className="flex items-start gap-2"><span className="text-violet-400 shrink-0">★</span>Купити напряму в адміністратора гри</li>
          </ul>
        </div>
      )}

      {/* Withdrawal form */}
      <WithdrawForm pcBalance={pc} onSuccess={load} />

      {/* History */}
      <HistoryTable rows={d.withdrawals} />

      </> /* end withdraw tab */}
    </div>
  );
}
