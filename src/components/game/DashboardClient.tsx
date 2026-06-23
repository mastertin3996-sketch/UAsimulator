"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2, TrendingUp, TrendingDown, Play, Loader2, CheckCircle2,
  AlertCircle, AlertTriangle, Wrench, Hammer, ChevronRight, ArrowUpRight,
  ArrowDownRight, RefreshCw, Star, DollarSign, ChevronDown, ChevronUp,
  Users, Factory, Smile, Calendar, Zap, BarChart2,
} from "lucide-react";
import { StatCard } from "@/components/game/StatCard";
import { RevenueChart } from "@/components/game/charts/FinanceChart";
import { NetWorthChart, PnLChart } from "@/components/game/charts/NetWorthChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUAH, formatUSD, formatNumber } from "@/lib/utils";

interface Warning {
  type: "EQUIPMENT_WORN" | "EQUIPMENT_BROKEN";
  severity: "error" | "warning";
  enterpriseId: string; enterpriseName: string; detail: string;
}
interface SnapshotPoint {
  tick: number; cashBalance: number; totalAssets: number;
  revenue: number; opex: number; netProfit: number;
}
interface DashData {
  player: {
    companyName: string; cashBalance: number; balanceUsd: number; netWorth: number;
    creditRating: number; reputationScore: number; companyValuationUah: number;
    isOperationsFrozen: boolean; isBankrupt: boolean;
  };
  enterprises: { id: string; name: string; type: string; city: string; isActive: boolean; isFrozen: boolean; employees: number; workshops: number }[];
  chartData: { date: string; revenue: number; expenses: number; profit: number }[];
  snapshotChart: SnapshotPoint[];
  currentTick: number;
  warnings: Warning[];
  recentTxns: { type: string; amount: number; description: string | null; date: string }[];
  stats: { employeeCount: number; avgEfficiency: number; avgMood: number; totalUnitsThisTick: number; avgQualityThisTick: number; ticksUntilMonth: number };
  pnl: { revenue: number; opex: number; netProfit: number; employees: number; mood: number } | null;
}

function WarningsBanner({ warnings }: { warnings: Warning[] }) {
  const [open, setOpen] = useState(false);
  if (warnings.length === 0) return null;
  const errors = warnings.filter((w) => w.severity === "error").length;
  const warns  = warnings.filter((w) => w.severity === "warning").length;
  return (
    <div className={cn("rounded-xl border", errors > 0 ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5")}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          {errors > 0 ? <AlertCircle size={16} className="text-red-400 shrink-0" /> : <AlertTriangle size={16} className="text-amber-400 shrink-0" />}
          <span className="text-sm font-medium text-white">
            {errors > 0 && <span className="text-red-400 font-semibold">{errors} критичних</span>}
            {errors > 0 && warns > 0 && <span className="text-gray-500 mx-1">·</span>}
            {warns > 0 && <span className="text-amber-400">{warns} попереджень</span>}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      {open && (
        <div className="border-t border-white/5 px-4 pb-3 space-y-2 pt-2">
          {warnings.map((w, i) => {
            const Icon = w.type === "EQUIPMENT_BROKEN" ? Hammer : Wrench;
            return (
              <div key={i} className="flex items-start gap-3">
                <Icon size={13} className={cn("mt-0.5 shrink-0", w.severity === "error" ? "text-red-400" : "text-amber-400")} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-semibold", w.severity === "error" ? "text-red-400" : "text-amber-400")}>
                      {w.type === "EQUIPMENT_BROKEN" ? "Зламано" : "Знос"}
                    </span>
                    <Link href={`/enterprises/${w.enterpriseId}`} className="text-xs text-gray-400 hover:text-white underline">{w.enterpriseName}</Link>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{w.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TickState = "idle" | "loading" | "done" | "error";
function NextTickButton({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<TickState>("idle");
  const [info, setInfo]   = useState("");
  const run = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const res  = await fetch("/api/admin/tick", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Помилка");
      setInfo(`Тік ${data.tickNumber} — ${data.durationMs}мс`);
      setState("done");
      setTimeout(() => { setState("idle"); onDone(); }, 2500);
    } catch (e: unknown) {
      setInfo(e instanceof Error ? e.message : "Помилка");
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };
  const colors: Record<TickState, string> = {
    idle:    "bg-emerald-600 hover:bg-emerald-500 text-white",
    loading: "bg-emerald-800 text-emerald-300 cursor-not-allowed",
    done:    "bg-emerald-900 text-emerald-300",
    error:   "bg-red-900 text-red-300",
  };
  return (
    <div className="flex items-center gap-2">
      {(state === "done" || state === "error") && (
        <span className={cn("text-xs flex items-center gap-1", state === "done" ? "text-emerald-400" : "text-red-400")}>
          {state === "done" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {info}
        </span>
      )}
      <button onClick={run} disabled={state === "loading"}
        className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all", colors[state])}>
        {state === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        Наступний хід
      </button>
    </div>
  );
}

function RefreshCountdown({ onRefresh }: { onRefresh: () => void }) {
  const [secs, setSecs] = useState(60);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => { if (s <= 1) { onRefresh(); return 60; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [onRefresh]);
  return (
    <button onClick={() => { onRefresh(); setSecs(60); }} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400">
      <RefreshCw size={10} /> {secs}с
    </button>
  );
}

const TYPE_LABELS: Record<string, string> = {
  OFFICE: "Офіс", AGRO_FARM: "Агроферма", TEXTILE_FACTORY: "Текстиль",
  FOOD_PROCESSING: "Харчова переробка", RETAIL_STORE: "Магазин",
  WAREHOUSE: "Склад", LOGISTICS_HUB: "Логістика", RD_LABORATORY: "R&D",
};
const TXN_LABELS: Record<string, { label: string; color: string }> = {
  MARKET_SALE:      { label: "Продаж",        color: "text-emerald-400" },
  MARKET_PURCHASE:  { label: "Закупівля",     color: "text-red-400"    },
  SALARY_PAYMENT:   { label: "Зарплата",      color: "text-amber-400"  },
  TAX_PAYMENT:      { label: "Податки",       color: "text-orange-400" },
  ENERGY_BILL:      { label: "Електрика",     color: "text-blue-400"   },
  LOAN_DISBURSEMENT:{ label: "Кредит",        color: "text-violet-400" },
  DEPOSIT_MATURITY: { label: "Депозит",       color: "text-emerald-300"},
  IPO_PROCEEDS:     { label: "IPO",           color: "text-emerald-400"},
  DIVIDEND_PAYMENT: { label: "Дивіденди",     color: "text-amber-400"  },
  NPC_SALE:         { label: "NPC продаж",    color: "text-emerald-400"},
  INITIAL_DEPOSIT:  { label: "Стартовий",     color: "text-emerald-400"},
  GM_ADJUSTMENT:    { label: "GM коригув.",   color: "text-violet-400" },
};

export default function DashboardClient() {
  const [data, setData]         = useState<DashData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [liveTick, setLiveTick] = useState<number | null>(null);
  const [chartTab, setChartTab] = useState<"networth" | "pnl" | "revenue">("networth");
  const esRef = useRef<EventSource | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // SSE — live tick events
  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/events/tick");
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; tickNumber?: number };
          if (msg.type === "tick" && msg.tickNumber) { setLiveTick(msg.tickNumber); loadData(); }
          if (msg.type === "reconnect") { es.close(); setTimeout(connect, 1000); }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es.close(); setTimeout(connect, 5000); };
    }
    connect();
    return () => { esRef.current?.close(); };
  }, [loadData]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data?.player) {
    return <div className="flex items-center justify-center min-h-[60vh] gap-2 text-gray-500"><AlertCircle size={18} /> Помилка завантаження</div>;
  }

  const { player, enterprises, chartData, snapshotChart, currentTick, warnings, recentTxns, stats, pnl } = data;
  const displayTick = liveTick ?? currentTick;

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{player.companyName}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
              <Star size={10} className="text-yellow-400" /> Рейтинг {player.creditRating.toFixed(1)}
            </span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full flex items-center gap-1",
              liveTick ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-400")}>
              {liveTick && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              Тік #{displayTick}
            </span>
            {player.isOperationsFrozen && <span className="text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">Операції заморожені</span>}
            {player.isBankrupt && <span className="text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">БАНКРУТСТВО</span>}
            <RefreshCountdown onRefresh={loadData} />
          </div>
        </div>
        <NextTickButton onDone={loadData} />
      </div>

      {/* ── Top stats row 1: financial ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Баланс (UAH)" value={formatUAH(player.cashBalance)} icon={TrendingUp} iconColor="text-yellow-400" iconBg="bg-yellow-950" subtext="Гривневий рахунок" />
        <StatCard label="Баланс (USD)" value={formatUSD(player.balanceUsd)} icon={DollarSign} iconColor="text-emerald-400" iconBg="bg-emerald-950" subtext="Валютний рахунок" />
        <StatCard label="Чистий капітал" value={formatUAH(player.netWorth)} icon={BarChart2} iconColor="text-violet-400" iconBg="bg-violet-950"
          subtext={pnl ? `Прибуток: ${pnl.netProfit >= 0 ? "+" : ""}₴${formatNumber(Math.round(pnl.netProfit))}` : "Оцінка компанії"} />
        <StatCard label="Оцінка компанії" value={formatUAH(player.companyValuationUah)} icon={Star} iconColor="text-blue-400" iconBg="bg-blue-950"
          subtext={`Репутація ${player.reputationScore.toFixed(1)}`} />
      </div>

      {/* ── Top stats row 2: operational ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center shrink-0"><Users size={15} className="text-blue-400" /></div>
          <div>
            <p className="text-xs text-gray-500">Працівників</p>
            <p className="text-lg font-bold text-white">{stats.employeeCount}</p>
            <p className="text-[10px] text-gray-600">еф. {(stats.avgEfficiency * 100).toFixed(0)}%</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-950 flex items-center justify-center shrink-0"><Smile size={15} className="text-amber-400" /></div>
          <div>
            <p className="text-xs text-gray-500">Настрій</p>
            <p className="text-lg font-bold text-white">{(stats.avgMood * 100).toFixed(0)}%</p>
            <p className="text-[10px] text-gray-600">{stats.avgMood >= 0.7 ? "Відмінний" : stats.avgMood >= 0.4 ? "Нормальний" : "Поганий"}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 flex items-center justify-center shrink-0"><Factory size={15} className="text-emerald-400" /></div>
          <div>
            <p className="text-xs text-gray-500">Вироблено (тік)</p>
            <p className="text-lg font-bold text-white">{formatNumber(Math.round(stats.totalUnitsThisTick))}</p>
            <p className="text-[10px] text-gray-600">{stats.totalUnitsThisTick > 0 ? `якість ${(stats.avgQualityThisTick * 100).toFixed(0)}%` : "ще не виробляли"}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-950 flex items-center justify-center shrink-0"><Calendar size={15} className="text-orange-400" /></div>
          <div>
            <p className="text-xs text-gray-500">До місячних виплат</p>
            <p className="text-lg font-bold text-white">{stats.ticksUntilMonth}</p>
            <p className="text-[10px] text-gray-600">тіків (зарплата, оренда)</p>
          </div>
        </div>
      </div>

      {warnings.length > 0 && <WarningsBanner warnings={warnings} />}

      {/* ── Main content grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: enterprises */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Підприємства</h2>
            <Link href="/enterprises" className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1">Всі <ChevronRight size={12} /></Link>
          </div>
          {enterprises.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
              <Building2 size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-3">Підприємств ще немає</p>
              <Link href="/enterprises" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors">Відкрити перше</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {enterprises.map((e) => (
                <Link key={e.id} href={`/enterprises/${e.id}`} className="block">
                  <div className={cn("rounded-xl border bg-gray-900 p-4 hover:border-gray-600 transition-all cursor-pointer",
                    e.isFrozen ? "border-red-800/60 opacity-70" : e.isActive ? "border-gray-800" : "border-gray-800 opacity-60")}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{e.name}</p>
                        <p className="text-xs text-gray-500">{TYPE_LABELS[e.type] ?? e.type} · {e.city}</p>
                      </div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                        e.isFrozen ? "bg-red-950 text-red-400" : e.isActive ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-500")}>
                        {e.isFrozen ? "Заморожено" : e.isActive ? "Активне" : "Неактивне"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1"><Users size={10} /> {e.employees}</span>
                      <span className="flex items-center gap-1"><Zap size={10} /> {e.workshops} цехів</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: charts */}
        <div className="space-y-3">
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {(["networth", "pnl", "revenue"] as const).map((t) => {
              const labels = { networth: "Капітал", pnl: "P&L", revenue: "Дохід/Витрати" };
              return (
                <button key={t} onClick={() => setChartTab(t)}
                  className={cn("flex-1 text-[11px] py-1 rounded-lg font-medium transition-colors",
                    chartTab === t ? "bg-gray-800 text-white" : "text-gray-600 hover:text-gray-400")}>
                  {labels[t]}
                </button>
              );
            })}
          </div>

          <Card>
            <CardContent className="pt-4">
              {chartTab === "networth" && <NetWorthChart data={snapshotChart} />}
              {chartTab === "pnl"      && <PnLChart data={snapshotChart} />}
              {chartTab === "revenue"  && (
                chartData.length === 0
                  ? <div className="flex items-center justify-center h-36 text-gray-600 text-xs">Дані після першого тіку</div>
                  : <RevenueChart data={chartData.map((d) => ({ tick: 0, ...d }))} compact />
              )}
            </CardContent>
          </Card>

          {pnl && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Останній період P&L</p>
              {[
                { label: "Дохід",    value: pnl.revenue,   color: "text-emerald-400" },
                { label: "Витрати",  value: pnl.opex,      color: "text-red-400"     },
                { label: "Прибуток", value: pnl.netProfit, color: pnl.netProfit >= 0 ? "text-emerald-400" : "text-red-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className={cn("text-xs font-mono font-semibold", color)}>
                    {value >= 0 ? "+" : ""}₴{formatNumber(Math.round(value))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent transactions ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Останні транзакції</CardTitle>
            <Link href="/finances" className="text-xs text-emerald-500 hover:text-emerald-400">Всі →</Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {recentTxns.length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center">Транзакцій ще немає</p>
          ) : (
            <div className="divide-y divide-gray-800">
              {recentTxns.map((t, i) => {
                const cfg = TXN_LABELS[t.type] ?? { label: t.type.replace(/_/g, " "), color: "text-gray-400" };
                const isPos = t.amount >= 0;
                return (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      {isPos ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-red-500" />}
                      <div>
                        <p className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</p>
                        {t.description && <p className="text-xs text-gray-600 truncate max-w-48">{t.description}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-xs font-mono font-semibold", isPos ? "text-emerald-400" : "text-red-400")}>
                        {isPos ? "+" : ""}{formatNumber(Math.abs(t.amount))} UAH
                      </p>
                      <p className="text-xs text-gray-600">{new Date(t.date).toLocaleDateString("uk-UA")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quick links ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { href: "/enterprises",   label: "Підприємства", icon: Building2,   color: "text-blue-400",    bg: "bg-blue-950"    },
          { href: "/market",        label: "Ринок",        icon: TrendingUp,  color: "text-emerald-400", bg: "bg-emerald-950" },
          { href: "/finances",      label: "Фінанси",      icon: TrendingDown,color: "text-amber-400",   bg: "bg-amber-950"   },
          { href: "/banking",       label: "Банківська",   icon: DollarSign,  color: "text-violet-400",  bg: "bg-violet-950"  },
          { href: "/supply-routes", label: "Маршрути",     icon: ChevronRight,color: "text-cyan-400",    bg: "bg-cyan-950"    },
          { href: "/qualification", label: "Кваліфікація", icon: Star,        color: "text-purple-400",  bg: "bg-purple-950"  },
        ].map(({ href, label, icon: Icon, color, bg }) => (
          <Link key={href} href={href} className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex flex-col items-center gap-2 hover:border-gray-600 transition-all">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", bg)}>
              <Icon size={16} className={color} />
            </div>
            <span className="text-[11px] font-medium text-gray-400 text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
