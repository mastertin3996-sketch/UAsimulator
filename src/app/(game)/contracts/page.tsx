"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollText, Loader2, Trash2, PauseCircle, PlayCircle,
  ArrowRight, Star, CheckCircle2, XCircle, Clock, Building2,
  Search, SortAsc, AlertTriangle, TrendingUp, ChevronsUpDown,
  CalendarClock, Package,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractStatus = "OPEN" | "ACTIVE" | "PAUSED" | "TERMINATED" | "EXPIRED" | "COMPLETED";
type SortKey = "revenuePerTick" | "progress" | "expiry" | "createdAt" | "lifetimePaid";

interface Exec {
  status      : string;
  qtyDelivered: number;
  totalPaid   : number;
  at          : string;
}

interface Contract {
  id                : string;
  status            : ContractStatus;
  productName       : string;
  productUnit       : string;
  basePrice         : number;
  qtyPerTick        : number;
  pricePerUnit      : number;
  quality           : number;
  durationTicks     : number | null;
  executedTicks     : number;
  expiresAt         : string | null;
  createdAt         : string;
  lastExecutedAt    : string | null;
  sellerCompanyName : string;
  buyerCompanyName  : string | null;
  sellerEntName     : string;
  sellerCity        : string;
  buyerEntName      : string | null;
  buyerCity         : string | null;
  recentExecs       : Exec[];
  lifetimePaid      : number;
  lifetimeQty       : number;
  execCount         : number;
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_META: Record<ContractStatus, {
  label : string;
  color : string;
  border: string;
  bg    : string;
  dim   : boolean;
}> = {
  OPEN      : { label: "Очікує",    color: "text-blue-400",    border: "border-blue-900/50",    bg: "bg-blue-950/20",   dim: false },
  ACTIVE    : { label: "Активний",  color: "text-emerald-400", border: "border-emerald-900/50", bg: "bg-emerald-950/10",dim: false },
  PAUSED    : { label: "Пауза",     color: "text-amber-400",   border: "border-amber-900/50",   bg: "bg-amber-950/10",  dim: false },
  TERMINATED: { label: "Скасовано", color: "text-red-400",     border: "border-red-900/30",     bg: "bg-gray-900",      dim: true  },
  EXPIRED   : { label: "Минув",     color: "text-gray-500",    border: "border-gray-800",       bg: "bg-gray-900",      dim: true  },
  COMPLETED : { label: "Виконано",  color: "text-purple-400",  border: "border-purple-900/30",  bg: "bg-gray-900",      dim: true  },
};

const ACTIVE_STATUSES: ContractStatus[] = ["OPEN", "ACTIVE", "PAUSED"];

const FILTERS: { value: string; label: string }[] = [
  { value: "",           label: "Всі"       },
  { value: "ACTIVE",     label: "Активні"   },
  { value: "OPEN",       label: "Очікують"  },
  { value: "PAUSED",     label: "Пауза"     },
  { value: "COMPLETED",  label: "Виконано"  },
  { value: "TERMINATED", label: "Скасовано" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "revenuePerTick", label: "Дохід/тік"    },
  { key: "lifetimePaid",   label: "Всього сплач." },
  { key: "progress",       label: "Прогрес %"     },
  { key: "expiry",         label: "Дедлайн"       },
  { key: "createdAt",      label: "Дата створ."   },
];

const EXPIRY_WARN_TICKS = 5;
const EXPIRY_WARN_MS    = 2 * 24 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function revenuePerTick(c: Contract) {
  return c.qtyPerTick * c.pricePerUnit;
}

function progressPct(c: Contract) {
  if (!c.durationTicks || c.durationTicks === 0) return null;
  return Math.min(100, (c.executedTicks / c.durationTicks) * 100);
}

function isExpiringSoon(c: Contract) {
  if (c.durationTicks !== null) {
    const remaining = c.durationTicks - c.executedTicks;
    if (remaining <= EXPIRY_WARN_TICKS && remaining > 0) return true;
  }
  if (c.expiresAt) {
    const left = new Date(c.expiresAt).getTime() - Date.now();
    if (left > 0 && left <= EXPIRY_WARN_MS) return true;
  }
  return false;
}

// ─── Exec dot ─────────────────────────────────────────────────────────────────

function ExecDot({ exec }: { exec: Exec }) {
  const ok = exec.status === "DELIVERED" || exec.status === "COMPLETED" || exec.qtyDelivered > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-mono",
      ok ? "text-emerald-400" : "text-red-400",
    )}>
      {ok ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
      {ok ? `${formatNumber(Math.round(exec.qtyDelivered))} ₴${formatNumber(Math.round(exec.totalPaid))}` : "0"}
    </span>
  );
}

// ─── Expiry badge ─────────────────────────────────────────────────────────────

function ExpiryBadge({ contract }: { contract: Contract }) {
  if (!ACTIVE_STATUSES.includes(contract.status)) return null;

  const ticksLeft = contract.durationTicks !== null
    ? contract.durationTicks - contract.executedTicks
    : null;

  if (ticksLeft === null && !contract.expiresAt) return null;

  const warning = isExpiringSoon(contract);

  return (
    <div className={cn(
      "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium",
      warning
        ? "bg-amber-950/60 text-amber-300 border border-amber-800/50"
        : "bg-gray-800 text-gray-500",
    )}>
      {warning && <AlertTriangle size={9} />}
      <CalendarClock size={9} />
      {ticksLeft !== null
        ? `${ticksLeft} тіків`
        : `до ${fmtDate(contract.expiresAt)}`
      }
    </div>
  );
}

// ─── Contract card ────────────────────────────────────────────────────────────

function ContractCard({
  contract,
  isSeller,
  onAction,
}: {
  contract : Contract;
  isSeller : boolean;
  onAction : (id: string, action: "pause" | "resume" | "cancel") => Promise<void>;
}) {
  const [busy,     setBusy]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const meta     = STATUS_META[contract.status];
  const canAct   = ACTIVE_STATUSES.includes(contract.status);
  const pct      = progressPct(contract);
  const warning  = isExpiringSoon(contract);
  const revTick  = revenuePerTick(contract);
  const ticksLeft = contract.durationTicks !== null
    ? contract.durationTicks - contract.executedTicks
    : null;

  async function handle(action: "pause" | "resume" | "cancel") {
    if (action === "cancel" && !confirm(`Скасувати контракт на "${contract.productName}"?`)) return;
    setBusy(action);
    await onAction(contract.id, action);
    setBusy(null);
  }

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-opacity",
      warning && ACTIVE_STATUSES.includes(contract.status)
        ? "border-amber-900/60 bg-amber-950/5"
        : meta.border,
      !warning && meta.bg,
      meta.dim && "opacity-60",
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", meta.color, meta.border)}>
            {meta.label}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-amber-400">
            <Star size={10} fill="currentColor" />
            {contract.quality.toFixed(1)}
          </span>
          <span className="text-sm font-bold text-white">{contract.productName}</span>
          {warning && ACTIVE_STATUSES.includes(contract.status) && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-medium">
              <AlertTriangle size={9} />
              Скоро кінець
            </span>
          )}
        </div>
        <span className="text-sm font-mono text-emerald-400 whitespace-nowrap shrink-0">
          ₴{formatNumber(Math.round(revTick))}/тік
        </span>
      </div>

      {/* Volume + expiry row */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-xs text-gray-400">
          <span className="font-mono text-white">{formatNumber(contract.qtyPerTick)}</span> {contract.productUnit}/тік
          {" · "}
          <span className="font-mono text-white">₴{contract.pricePerUnit.toFixed(2)}</span>/{contract.productUnit}
        </p>
        <ExpiryBadge contract={contract} />
      </div>

      {/* Flow: seller → buyer */}
      <div className="flex items-center gap-2 text-xs mb-2">
        <div className="flex items-center gap-1 min-w-0">
          <Building2 size={11} className="text-gray-500 shrink-0" />
          <span className="text-gray-300 truncate">{contract.sellerEntName}</span>
          <span className="text-gray-600 text-[10px] truncate">({contract.sellerCity})</span>
        </div>
        <ArrowRight size={11} className="text-gray-600 shrink-0" />
        <div className="flex items-center gap-1 min-w-0">
          <Building2 size={11} className="text-gray-500 shrink-0" />
          {contract.buyerEntName
            ? <><span className="text-gray-300 truncate">{contract.buyerEntName}</span>
                <span className="text-gray-600 text-[10px] truncate">({contract.buyerCity})</span></>
            : <span className="text-gray-600 italic">немає покупця</span>
          }
        </div>
      </div>

      {/* Companies */}
      <p className="text-[10px] text-gray-600 mb-3">
        {contract.sellerCompanyName}
        {contract.buyerCompanyName && ` → ${contract.buyerCompanyName}`}
      </p>

      {/* Progress row */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 flex-wrap">
        <span>
          Виконано:{" "}
          <span className="text-white font-mono">{contract.executedTicks}</span>
          {contract.durationTicks !== null
            ? <span className={cn(
                ticksLeft !== null && ticksLeft <= EXPIRY_WARN_TICKS ? "text-amber-400" : "text-gray-600",
              )}>/{contract.durationTicks} тіків</span>
            : <span className="text-gray-600"> тіків (безстрок.)</span>
          }
        </span>
        {contract.lastExecutedAt && (
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {fmtDateTime(contract.lastExecutedAt)}
          </span>
        )}
        {contract.lifetimePaid > 0 && (
          <span className="text-blue-400/70 font-mono flex items-center gap-0.5">
            <TrendingUp size={9} />
            ₴{formatNumber(Math.round(contract.lifetimePaid))} всього
          </span>
        )}
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden mb-3">
          <div
            className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-amber-500" : "bg-emerald-600")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Recent executions (collapsible) */}
      {contract.recentExecs.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            <ChevronsUpDown size={10} />
            Останні виконання ({contract.execCount > 3 ? `3 з ${contract.execCount}` : contract.execCount})
          </button>
          {expanded && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {contract.recentExecs.map((e, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <ExecDot exec={e} />
                  <span className="text-[9px] text-gray-700">{fmtDateTime(e.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {canAct && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-800/60">
          {isSeller && contract.status === "ACTIVE" && (
            <button
              onClick={() => handle("pause")}
              disabled={busy !== null}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-40"
            >
              {busy === "pause" ? <Loader2 size={12} className="animate-spin" /> : <PauseCircle size={12} />}
              Пауза
            </button>
          )}
          {isSeller && contract.status === "PAUSED" && (
            <button
              onClick={() => handle("resume")}
              disabled={busy !== null}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
            >
              {busy === "resume" ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
              Відновити
            </button>
          )}
          <button
            onClick={() => handle("cancel")}
            disabled={busy !== null}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 ml-auto"
          >
            {busy === "cancel" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Скасувати
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const [sellerContracts, setSellerContracts] = useState<Contract[]>([]);
  const [buyerContracts,  setBuyerContracts]  = useState<Contract[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"seller" | "buyer">("seller");
  const [filter,   setFilter]   = useState("");
  const [search,   setSearch]   = useState("");
  const [sortKey,  setSortKey]  = useState<SortKey>("revenuePerTick");
  const [sortAsc,  setSortAsc]  = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/market/contract")
      .then((r) => r.json())
      .then((d) => {
        setSellerContracts(d.sellerContracts ?? []);
        setBuyerContracts(d.buyerContracts ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "pause" | "resume" | "cancel") {
    if (action === "cancel") {
      await fetch(`/api/market/contract/${id}`, { method: "DELETE" });
      const update = (prev: Contract[]) =>
        prev.map((c) => c.id === id ? { ...c, status: "TERMINATED" as ContractStatus } : c);
      setSellerContracts(update);
      setBuyerContracts(update);
    } else {
      const res  = await fetch(`/api/market/contract/${id}`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        const newStatus = data.status as ContractStatus;
        const update = (prev: Contract[]) =>
          prev.map((c) => c.id === id ? { ...c, status: newStatus } : c);
        setSellerContracts(update);
        setBuyerContracts(update);
      }
    }
  }

  const rawList = tab === "seller" ? sellerContracts : buyerContracts;

  const visible = useMemo(() => {
    let list = filter ? rawList.filter((c) => c.status === filter) : rawList;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.productName.toLowerCase().includes(q) ||
        c.sellerEntName.toLowerCase().includes(q) ||
        (c.buyerEntName ?? "").toLowerCase().includes(q) ||
        c.sellerCompanyName.toLowerCase().includes(q) ||
        (c.buyerCompanyName ?? "").toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "revenuePerTick": diff = revenuePerTick(a) - revenuePerTick(b); break;
        case "lifetimePaid":   diff = a.lifetimePaid - b.lifetimePaid; break;
        case "progress":       diff = (progressPct(a) ?? -1) - (progressPct(b) ?? -1); break;
        case "expiry": {
          const ea = a.expiresAt ? new Date(a.expiresAt).getTime() : (a.durationTicks ?? Infinity) * 1e12;
          const eb = b.expiresAt ? new Date(b.expiresAt).getTime() : (b.durationTicks ?? Infinity) * 1e12;
          diff = ea - eb;
          break;
        }
        case "createdAt": diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      }
      return sortAsc ? diff : -diff;
    });
  }, [rawList, filter, search, sortKey, sortAsc]);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const activeS  = sellerContracts.filter((c) => c.status === "ACTIVE").length;
  const pausedS  = sellerContracts.filter((c) => c.status === "PAUSED").length;
  const activeB  = buyerContracts.filter((c)  => c.status === "ACTIVE").length;
  const warnS    = sellerContracts.filter((c) => ACTIVE_STATUSES.includes(c.status) && isExpiringSoon(c)).length;
  const warnB    = buyerContracts.filter((c)  => ACTIVE_STATUSES.includes(c.status) && isExpiringSoon(c)).length;

  const totalRevPerTick  = sellerContracts.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + revenuePerTick(c), 0);
  const totalCostPerTick = buyerContracts.filter((c)  => c.status === "ACTIVE").reduce((s, c) => s + revenuePerTick(c), 0);
  const netPerTick       = totalRevPerTick - totalCostPerTick;
  const expiringAll      = warnS + warnB;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
          <ScrollText size={22} className="text-purple-400" />
          Контракти постачання
          {expiringAll > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-400 font-normal bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={11} />
              {expiringAll} скоро завершуються
            </span>
          )}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Довгострокові B2B угоди на поставку товарів</p>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-1">Активних продажів</p>
            <p className="text-xl font-bold text-emerald-400 font-mono">{activeS}</p>
            {pausedS > 0 && <p className="text-[10px] text-amber-400 mt-0.5">{pausedS} на паузі</p>}
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Активних закупок</p>
            <p className="text-xl font-bold text-white font-mono">{activeB}</p>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-1">Дохід / тік</p>
            <p className="text-xl font-bold text-emerald-400 font-mono">₴{formatNumber(Math.round(totalRevPerTick))}</p>
          </div>
          <div className="rounded-xl border border-red-900/20 bg-red-950/10 px-4 py-3">
            <p className="text-[10px] text-red-500/70 uppercase tracking-wider mb-1">Витрати / тік</p>
            <p className="text-xl font-bold text-red-400 font-mono">₴{formatNumber(Math.round(totalCostPerTick))}</p>
          </div>
          <div className={cn(
            "rounded-xl border px-4 py-3",
            netPerTick >= 0 ? "border-blue-900/30 bg-blue-950/10" : "border-red-900/30 bg-red-950/10",
          )}>
            <p className={cn("text-[10px] uppercase tracking-wider mb-1", netPerTick >= 0 ? "text-blue-500/70" : "text-red-500/70")}>
              Net / тік
            </p>
            <p className={cn("text-xl font-bold font-mono", netPerTick >= 0 ? "text-blue-400" : "text-red-400")}>
              {netPerTick >= 0 ? "+" : ""}₴{formatNumber(Math.round(netPerTick))}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800">
        {(["seller", "buyer"] as const).map((t) => {
          const contracts = t === "seller" ? sellerContracts : buyerContracts;
          const warn = t === "seller" ? warnS : warnB;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === t
                  ? "border-purple-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300",
              )}
            >
              {t === "seller" ? "Як продавець" : "Як покупець"}
              <span className="text-[10px] text-gray-600">({contracts.length})</span>
              {warn > 0 && (
                <span className="flex items-center gap-0.5 text-[9px] bg-amber-950/60 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-800/40">
                  <AlertTriangle size={8} />
                  {warn}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + Sort + Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 flex-1 min-w-[180px]">
            <Search size={13} className="text-gray-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за товаром або компанією…"
              className="bg-transparent text-sm text-white placeholder-gray-600 outline-none w-full"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <SortAsc size={13} className="text-gray-500" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-gray-800 border border-gray-700/50 rounded-lg text-xs text-white px-2 py-1.5 outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortAsc((v) => !v)}
              className="bg-gray-800 border border-gray-700/50 rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {sortAsc ? "↑" : "↓"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                filter === f.value
                  ? "bg-purple-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white",
              )}
            >
              {f.label}
              {f.value && (
                <span className="ml-1 text-[10px] opacity-60">
                  ({rawList.filter((c) => c.status === f.value).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
          <Package size={28} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {filter || search ? "Контрактів за фільтром не знайдено" : "Контрактів немає"}
          </p>
          {(filter || search) && (
            <button
              onClick={() => { setFilter(""); setSearch(""); }}
              className="text-xs text-purple-400 hover:text-purple-300 mt-2 transition-colors"
            >
              Скинути фільтри
            </button>
          )}
          {!filter && !search && tab === "seller" && (
            <p className="text-xs text-gray-600 mt-1">
              Створіть контракт на сторінці{" "}
              <a href="/market" className="text-blue-400 hover:text-blue-300">Ринку</a>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-[10px] text-gray-700">
            {visible.length} контрактів · {SORT_OPTIONS.find((s) => s.key === sortKey)?.label} {sortAsc ? "↑" : "↓"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visible.map((c) => (
              <ContractCard
                key={c.id}
                contract={c}
                isSeller={tab === "seller"}
                onAction={handleAction}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
