"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Landmark, TrendingDown, TrendingUp, PiggyBank, AlertCircle,
  CreditCard, Loader2, X, ChevronDown, CheckCircle2,
} from "lucide-react";
import { cn, formatUAH } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankingData {
  player: {
    cashBalance: number; balanceUsd: number; creditRating: number;
    netWorth: number; overdraftLimitUah: number; currentOverdraftUsageUah: number;
  };
  currentTick: number;
  creditOffer: { eligible: boolean; maxAmount: number; annualRatePct: number; monthlyPaymentPerMillion: number; reason?: string | null } | null;
  depositRates: { tier: string; uahRate: number; usdRate: number } | null;
  summary: {
    activeLoans: number; overdueLoans: number; totalDebt: number; monthlyBurden: number;
    activeDeposits: number; totalDeposited: number;
  };
  loans: {
    id: string; principalUah: number; remainingUah: number;
    annualInterestPct: number; monthlyPaymentUah: number;
    termMonths: number; paidMonths: number; missedPayments: number;
    status: string; issuedAt: string; nextPaymentTick: number;
  }[];
  deposits: {
    id: string; currency: string; principalAmount: number;
    annualYieldRate: number; durationTicks: number;
    isMatured: boolean; finalAmountPaid: number | null;
    matureAtTick: number; startTick: number;
  }[];
}

const TIER_COLORS: Record<string, string> = {
  HIGH: "text-emerald-400", MID: "text-blue-400",
  LOW:  "text-amber-400",  CRIT: "text-red-400",
};

const TIER_LABELS: Record<string, string> = {
  HIGH: "Висока ліквідність", MID: "Середня", LOW: "Низька", CRIT: "Критична",
};

// ─── Loan Modal ───────────────────────────────────────────────────────────────

function LoanModal({
  offer, onTaken, onClose,
}: { offer: NonNullable<BankingData["creditOffer"]>; onTaken: () => void; onClose: () => void }) {
  const [amount, setAmount]   = useState(Math.min(100_000, offer.maxAmount));
  const [term,   setTerm]     = useState(12);
  const [saving, setSaving]   = useState(false);
  const [err,    setErr]      = useState("");

  const monthly = offer.monthlyPaymentPerMillion * (amount / 1_000_000);

  async function take() {
    setSaving(true); setErr("");
    const res = await fetch("/api/banking/loan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUah: amount, termMonths: term }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setSaving(false); return; }
    onTaken();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Взяти кредит</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Сума (UAH)</label>
              <span className="text-xs font-mono text-white">{formatUAH(amount)}</span>
            </div>
            <input type="range" min={10_000} max={offer.maxAmount} step={10_000}
              value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="w-full accent-emerald-500" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>10 000 ₴</span>
              <span>{formatUAH(offer.maxAmount)}</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Строк (місяці)</label>
              <span className="text-xs font-mono text-white">{term} міс.</span>
            </div>
            <input type="range" min={3} max={60} step={3}
              value={term} onChange={e => setTerm(Number(e.target.value))}
              className="w-full accent-emerald-500" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>3 міс.</span>
              <span>60 міс.</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Ставка</span>
              <span className="font-mono text-amber-400">{offer.annualRatePct.toFixed(1)}% / рік</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Щомісячний платіж</span>
              <span className="font-mono text-white">{formatUAH(monthly)}</span>
            </div>
            <div className="flex justify-between text-sm pt-1.5 border-t border-gray-800 font-semibold">
              <span className="text-white">Отримаєте</span>
              <span className="font-mono text-emerald-400">{formatUAH(amount)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={take} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Отримати кредит
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Deposit Modal ────────────────────────────────────────────────────────────

function DepositModal({
  rates, cashBalance, balanceUsd, onOpened, onClose,
}: {
  rates: NonNullable<BankingData["depositRates"]>;
  cashBalance: number; balanceUsd: number;
  onOpened: () => void; onClose: () => void;
}) {
  const [currency, setCurrency] = useState<"UAH" | "USD">("UAH");
  const [amount, setAmount]     = useState(10_000);
  const [days, setDays]         = useState(30);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const rate    = currency === "UAH" ? rates.uahRate : rates.usdRate;
  const maxBal  = currency === "UAH" ? cashBalance : balanceUsd;
  const interest = amount * (rate / 100) * (days / 365);

  async function open() {
    setSaving(true); setErr("");
    const res = await fetch("/api/banking/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency, durationDays: days }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setSaving(false); return; }
    onOpened();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Відкрити депозит</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          {/* Currency */}
          <div className="grid grid-cols-2 gap-2">
            {(["UAH", "USD"] as const).map(c => (
              <button
                key={c}
                onClick={() => { setCurrency(c); setAmount(c === "UAH" ? 10_000 : 100); }}
                className={cn(
                  "rounded-lg border py-2.5 text-sm font-medium transition-all",
                  currency === c
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                    : "border-gray-800 bg-gray-900 text-gray-400 hover:text-white",
                )}
              >
                {c} · {c === "UAH" ? `${rates.uahRate.toFixed(1)}%` : `${rates.usdRate.toFixed(1)}%`} / рік
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Сума ({currency})</label>
              <span className="text-xs font-mono text-white">{currency === "UAH" ? formatUAH(amount) : `$${amount.toLocaleString()}`}</span>
            </div>
            <input type="range"
              min={currency === "UAH" ? 5_000 : 10}
              max={Math.max(1, Math.floor(maxBal))}
              step={currency === "UAH" ? 5_000 : 10}
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Строк (ігрових днів)</label>
              <span className="text-xs font-mono text-white">{days} днів</span>
            </div>
            <input type="range" min={7} max={365} step={7}
              value={days} onChange={e => setDays(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Ставка</span>
              <span className="font-mono text-amber-400">{rate.toFixed(2)}% / рік</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Відсотки за строк</span>
              <span className="font-mono text-emerald-400">+{currency === "UAH" ? formatUAH(interest) : `$${interest.toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between text-sm pt-1.5 border-t border-gray-800 font-semibold">
              <span className="text-white">Поверненню підлягає</span>
              <span className="font-mono text-emerald-300">
                {currency === "UAH" ? formatUAH(amount + interest) : `$${(amount + interest).toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={open} disabled={saving || amount > maxBal}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Відкрити депозит
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BankingPage() {
  const [data,    setData]    = useState<BankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"loans" | "deposits" | "overdraft">("loans");
  const [loanModal,    setLoanModal]    = useState(false);
  const [depositModal, setDepositModal] = useState(false);
  const [termParam, setTermParam]       = useState(12);
  const [repaying,   setRepaying]   = useState<string | null>(null);
  const [paying,     setPaying]     = useState<string | null>(null);
  const [payMsg,     setPayMsg]     = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/banking?term=${termParam}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [termParam]);

  useEffect(() => { load(); }, [load]);

  async function repayLoan(id: string, remaining: number) {
    if (!confirm(`Погасити залишок ${formatUAH(remaining)} достроково?`)) return;
    setRepaying(id);
    const res = await fetch(`/api/banking/loan?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    setRepaying(null);
    if (!res.ok) { alert(d.error ?? "Помилка"); return; }
    load();
  }

  async function payInstallment(id: string, monthlyPayment: number) {
    setPaying(id);
    setPayMsg(m => ({ ...m, [id]: "" }));
    const res = await fetch("/api/banking/loan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await res.json();
    setPaying(null);
    if (res.ok) {
      setPayMsg(m => ({ ...m, [id]: `✓ Сплачено ${formatUAH(d.paid)}` }));
      load();
    } else {
      setPayMsg(m => ({ ...m, [id]: `✗ ${d.error}` }));
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 rounded bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <div className="py-16 text-center text-gray-500">Помилка завантаження</div>;

  const { player, summary, creditOffer, depositRates, loans, deposits, currentTick } = data;
  const overdraftFree = player.overdraftLimitUah - player.currentOverdraftUsageUah;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark size={20} className="text-blue-400" /> Банківський центр
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Кредити, депозити та управління ліквідністю</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDepositModal(true)}>
            <PiggyBank size={14} /> Відкрити депозит
          </Button>
          <Button onClick={() => setLoanModal(true)} disabled={!creditOffer?.eligible}>
            <CreditCard size={14} /> Взяти кредит
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Кредитний рейтинг", icon: <CheckCircle2 size={14} />,
            value: player.creditRating.toFixed(1) + " / 10",
            color: player.creditRating >= 7 ? "text-emerald-400" : player.creditRating >= 5 ? "text-amber-400" : "text-red-400",
          },
          {
            label: "Борг / місяць", icon: <TrendingDown size={14} />,
            value: formatUAH(summary.monthlyBurden),
            color: summary.totalDebt > 0 ? "text-orange-400" : "text-gray-400",
          },
          {
            label: "На депозитах", icon: <PiggyBank size={14} />,
            value: formatUAH(summary.totalDeposited),
            color: "text-emerald-400",
          },
          {
            label: "Овердрафт (вільно)", icon: <CreditCard size={14} />,
            value: player.overdraftLimitUah > 0 ? formatUAH(overdraftFree) : "Недоступний",
            color: overdraftFree > 0 ? "text-blue-400" : "text-red-400",
          },
        ].map(({ label, icon, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              {icon} {label}
            </p>
            <p className={cn("text-lg font-bold font-mono", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Deposit rates banner */}
      {depositRates && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-xs text-gray-500">Поточна ставка депозитів</p>
          <span className={cn("text-xs font-medium", TIER_COLORS[depositRates.tier] ?? "text-white")}>
            {TIER_LABELS[depositRates.tier]}
          </span>
          <div className="flex gap-4 ml-auto">
            <div className="text-center">
              <p className="text-[10px] text-gray-600">UAH</p>
              <p className="text-sm font-mono font-semibold text-emerald-400">{depositRates.uahRate.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-600">USD</p>
              <p className="text-sm font-mono font-semibold text-blue-400">{depositRates.usdRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Credit offer */}
      {creditOffer && (
        <div className={cn(
          "rounded-xl border p-4 space-y-2",
          creditOffer.eligible ? "border-emerald-600/30 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5",
        )}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Кредитна пропозиція (строк {termParam} міс.)</h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Строк:</label>
              <div className="relative">
                <select
                  value={termParam}
                  onChange={e => setTermParam(Number(e.target.value))}
                  className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white appearance-none pr-5 focus:outline-none"
                >
                  {[3,6,12,24,36,48,60].map(t => <option key={t} value={t}>{t} міс.</option>)}
                </select>
                <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
          </div>
          {creditOffer.eligible ? (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] text-gray-500">Максимум</p>
                <p className="text-lg font-bold text-white font-mono">{formatUAH(creditOffer.maxAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Ставка</p>
                <p className="text-lg font-bold text-amber-400 font-mono">{creditOffer.annualRatePct.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Платіж / 1М</p>
                <p className="text-lg font-bold text-orange-400 font-mono">{formatUAH(creditOffer.monthlyPaymentPerMillion)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-400 flex items-center gap-2">
              <AlertCircle size={13} /> {creditOffer.reason ?? "Кредит недоступний"}
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {[
          { key: "loans" as const, label: `Кредити (${summary.activeLoans})` },
          { key: "deposits" as const, label: `Депозити (${summary.activeDeposits})` },
          { key: "overdraft" as const, label: "Овердрафт" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "text-emerald-400 border-emerald-400" : "text-gray-500 border-transparent hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loans tab */}
      {tab === "loans" && (
        <div className="space-y-3">
          {summary.overdueLoans > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              <AlertCircle size={14} /> {summary.overdueLoans} прострочених кредити — кредитний рейтинг знижується
            </div>
          )}
          {loans.length === 0 ? (
            <div className="py-12 text-center">
              <CreditCard size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Кредитів немає</p>
            </div>
          ) : loans.map(l => {
            const progress = l.principalUah > 0 ? ((l.principalUah - l.remainingUah) / l.principalUah) * 100 : 0;
            return (
              <div key={l.id} className={cn("rounded-xl border bg-gray-900 p-4", l.status === "OVERDUE" ? "border-red-500/30" : "border-gray-800")}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{formatUAH(l.principalUah)} · {l.termMonths} міс.</p>
                    <p className="text-xs text-gray-500">{l.annualInterestPct.toFixed(1)}% / рік · виданий {new Date(l.issuedAt).toLocaleDateString("uk")}</p>
                  </div>
                  <span className={cn(
                    "text-xs font-medium rounded-full px-2 py-0.5",
                    l.status === "ACTIVE" ? "text-emerald-400 bg-emerald-500/10"
                    : l.status === "OVERDUE" ? "text-red-400 bg-red-500/10"
                    : "text-gray-500 bg-gray-800",
                  )}>
                    {l.status === "ACTIVE" ? "Активний" : l.status === "OVERDUE" ? "Прострочений" : l.status}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Залишок: {formatUAH(l.remainingUah)}</span>
                    <span>Платіж: {formatUAH(l.monthlyPaymentUah)} / міс.</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-600">
                    <span>{l.paidMonths} / {l.termMonths} місяців</span>
                    {l.missedPayments > 0 && <span className="text-red-400">{l.missedPayments} пропущених</span>}
                  </div>
                  {payMsg[l.id] && (
                    <p className={`text-xs ${payMsg[l.id].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{payMsg[l.id]}</p>
                  )}
                  <div className="flex items-center justify-between pt-1 gap-2">
                    <button
                      onClick={() => payInstallment(l.id, l.monthlyPaymentUah)}
                      disabled={paying === l.id || l.status === "PAID_OFF"}
                      className="flex items-center gap-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 transition-colors"
                    >
                      {paying === l.id ? <Loader2 size={11} className="animate-spin" /> : null}
                      Сплатити {formatUAH(l.monthlyPaymentUah)}
                    </button>
                    <button
                      onClick={() => repayLoan(l.id, l.remainingUah)}
                      disabled={repaying === l.id}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-emerald-400 transition-colors"
                    >
                      {repaying === l.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                      Погасити достроково
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deposits tab */}
      {tab === "deposits" && (
        <div className="space-y-3">
          {deposits.length === 0 ? (
            <div className="py-12 text-center">
              <PiggyBank size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">Депозитів немає</p>
              <Button size="sm" onClick={() => setDepositModal(true)}><PiggyBank size={13} /> Відкрити перший</Button>
            </div>
          ) : deposits.map(d => {
            const progress = d.durationTicks > 0
              ? Math.min(100, ((currentTick - d.startTick) / d.durationTicks) * 100)
              : 100;
            const projectedInterest = d.principalAmount * (d.annualYieldRate) * (d.durationTicks / 365);
            return (
              <div key={d.id} className={cn("rounded-xl border bg-gray-900 p-4", d.isMatured ? "border-gray-700 opacity-60" : "border-gray-800")}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {d.currency === "UAH" ? formatUAH(d.principalAmount) : `$${d.principalAmount.toLocaleString()}`}
                      {" · "}{d.durationTicks} днів
                    </p>
                    <p className="text-xs text-gray-500">{(d.annualYieldRate * 100).toFixed(2)}% / рік ({d.currency})</p>
                  </div>
                  {d.isMatured ? (
                    <span className="text-xs font-medium text-gray-400 bg-gray-800 rounded-full px-2 py-0.5">Погашений</span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5">Активний</span>
                  )}
                </div>
                {!d.isMatured && (
                  <div className="space-y-2">
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Дозріє тік #{d.matureAtTick}</span>
                      <span className="text-emerald-400">+{d.currency === "UAH" ? formatUAH(projectedInterest) : `$${projectedInterest.toFixed(2)}`} відсотків</span>
                    </div>
                  </div>
                )}
                {d.isMatured && d.finalAmountPaid && (
                  <p className="text-xs text-gray-400">Виплачено: {d.currency === "UAH" ? formatUAH(d.finalAmountPaid) : `$${d.finalAmountPaid.toFixed(2)}`}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Overdraft tab */}
      {tab === "overdraft" && (
        <div className="space-y-4">
          {player.overdraftLimitUah === 0 ? (
            <div className="py-12 text-center">
              <CreditCard size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Овердрафт недоступний</p>
              <p className="text-xs text-gray-600 mt-1">Підвищіть кредитний рейтинг до 6.0+</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white">Стан овердрафту</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Ліміт", value: formatUAH(player.overdraftLimitUah) },
                    { label: "Використано", value: formatUAH(player.currentOverdraftUsageUah), color: player.currentOverdraftUsageUah > 0 ? "text-orange-400" : "text-gray-400" },
                    { label: "Вільно", value: formatUAH(overdraftFree), color: "text-emerald-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className="text-[10px] text-gray-500">{label}</p>
                      <p className={cn("text-sm font-mono font-semibold", color ?? "text-white")}>{value}</p>
                    </div>
                  ))}
                </div>
                {player.currentOverdraftUsageUah > 0 && (
                  <div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${(player.currentOverdraftUsageUah / player.overdraftLimitUah) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Ставка: 36% / рік (0.0986% / день)</p>
                  </div>
                )}
              </div>
              {player.currentOverdraftUsageUah > 0 && (
                <OverdraftSettle
                  usage={player.currentOverdraftUsageUah}
                  cashBalance={player.cashBalance}
                  onSettled={load}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {loanModal && creditOffer?.eligible && (
        <LoanModal offer={creditOffer} onTaken={() => { setLoanModal(false); load(); }} onClose={() => setLoanModal(false)} />
      )}
      {depositModal && depositRates && (
        <DepositModal
          rates={depositRates}
          cashBalance={player.cashBalance}
          balanceUsd={player.balanceUsd}
          onOpened={() => { setDepositModal(false); load(); }}
          onClose={() => setDepositModal(false)}
        />
      )}
    </div>
  );
}

function OverdraftSettle({ usage, cashBalance, onSettled }: { usage: number; cashBalance: number; onSettled: () => void }) {
  const [amount, setAmount] = useState(Math.min(usage, cashBalance));
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function settle() {
    setSaving(true); setErr("");
    const res = await fetch("/api/banking/overdraft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUah: amount }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setSaving(false); return; }
    onSettled();
  }

  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
        <TrendingUp size={14} className="text-orange-400" /> Погасити овердрафт
      </h4>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-500">Сума погашення</span>
          <span className="text-xs font-mono text-white">{formatUAH(amount)}</span>
        </div>
        <input type="range" min={100} max={Math.min(usage, cashBalance)} step={100}
          value={amount} onChange={e => setAmount(Number(e.target.value))}
          className="w-full accent-orange-500" />
      </div>
      <Button className="w-full" onClick={settle} disabled={saving || amount <= 0 || cashBalance <= 0}>
        {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
        Погасити {formatUAH(amount)}
      </Button>
    </div>
  );
}
