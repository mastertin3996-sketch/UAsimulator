"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield, RefreshCw, Play, Loader2, Users, Building2,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Zap,
  DollarSign, BarChart3, Skull, Snowflake, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface Overview {
  currentTick: number; playerCount: number; enterpriseCount: number;
  openOrderCount: number; totalTrades: number; bankruptCount: number;
  frozenCount: number; avgTickMs: number;
}
interface TickRecord {
  tickNumber: number; durationMs: number | null;
  startedAt: string | null; completedAt: string | null;
}
interface PlayerRow {
  id: string; username: string; companyName: string;
  cashBalance: number; balanceUsd: number; netWorth: number;
  creditRating: number; reputationScore: number;
  isBankrupt: boolean; isOperationsFrozen: boolean; enterpriseCount: number;
}

type Tab = "overview" | "players" | "ticks";

export default function GmPanelClient() {
  const [tab, setTab]           = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ticks, setTicks]       = useState<TickRecord[]>([]);
  const [players, setPlayers]   = useState<PlayerRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tickState, setTickState] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [tickInfo, setTickInfo] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<PlayerRow | null>(null);
  const [adjustAmt, setAdjustAmt]       = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/stats");
      const d = await r.json();
      setOverview(d.overview);
      setTicks(d.recentTicks ?? []);
      setPlayers(d.players ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runTick() {
    setTickState("loading");
    const r = await fetch("/api/admin/tick", { method: "POST" });
    const d = await r.json();
    if (r.ok) {
      setTickInfo(`Тік ${d.tickNumber} за ${d.durationMs}мс`);
      setTickState("done");
      setTimeout(() => { setTickState("idle"); load(); }, 2500);
    } else {
      setTickInfo(d.error ?? "Помилка");
      setTickState("error");
      setTimeout(() => setTickState("idle"), 3000);
    }
  }

  async function submitAdjust() {
    if (!adjustTarget) return;
    const amount = parseFloat(adjustAmt);
    if (!amount || isNaN(amount)) return;
    setAdjusting(true);
    const r = await fetch("/api/admin/adjust", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: adjustTarget.id, amountUah: amount, reason: adjustReason || undefined }),
    });
    setAdjusting(false);
    const d = await r.json();
    if (r.ok) { alert(`✓ Баланс ${d.companyName}: ${d.amountUah > 0 ? "+" : ""}${formatNumber(d.amountUah)} UAH\nНовий: ₴${formatNumber(Math.round(d.newBalance))}`); setAdjustTarget(null); setAdjustAmt(""); setAdjustReason(""); window.dispatchEvent(new CustomEvent("game:balance")); load(); }
    else alert(d.error);
  }

  const TABS: { key: Tab; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
    { key: "overview", label: "Огляд",    icon: BarChart3 },
    { key: "players",  label: "Гравці",   icon: Users    },
    { key: "ticks",    label: "Тіки",     icon: Clock    },
  ];

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-gray-500" size={32} />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950 flex items-center justify-center">
            <Shield size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">GM Панель</h1>
            <p className="text-xs text-gray-500">Управління грою · Тік #{overview?.currentTick ?? 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(tickState === "done" || tickState === "error") && (
            <span className={cn("text-xs", tickState === "done" ? "text-emerald-400" : "text-red-400")}>{tickInfo}</span>
          )}
          <button onClick={load} className="p-2 rounded-lg border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={runTick} disabled={tickState === "loading"}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
              tickState === "loading" ? "bg-emerald-900 text-emerald-300 cursor-not-allowed" :
              tickState === "done"    ? "bg-emerald-900 text-emerald-300" :
              tickState === "error"   ? "bg-red-900 text-red-300" :
              "bg-emerald-600 hover:bg-emerald-500 text-white"
            )}
          >
            {tickState === "loading" ? <Loader2 size={14} className="animate-spin" /> : tickState === "done" ? <CheckCircle2 size={14} /> : <Play size={14} />}
            Запустити тік
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-xl p-1 border border-gray-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === key ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && overview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Гравців",        value: overview.playerCount,    icon: Users,     color: "text-blue-400",    bg: "bg-blue-950"   },
              { label: "Підприємств",    value: overview.enterpriseCount, icon: Building2, color: "text-emerald-400", bg: "bg-emerald-950"},
              { label: "Відкрит. ордери",value: overview.openOrderCount,  icon: TrendingUp,color: "text-amber-400",   bg: "bg-amber-950"  },
              { label: "Всього угод",    value: overview.totalTrades,     icon: Zap,       color: "text-violet-400",  bg: "bg-violet-950" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", bg)}>
                  <Icon size={16} className={color} />
                </div>
                <p className="text-2xl font-bold text-white">{formatNumber(value)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-3">
              <Clock size={18} className="text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Серед. тривалість тіку</p>
                <p className="text-lg font-bold text-white">{overview.avgTickMs}мс</p>
              </div>
            </div>
            <div className={cn("rounded-xl border p-4 flex items-center gap-3", overview.bankruptCount > 0 ? "border-red-900 bg-red-950/20" : "border-gray-800 bg-gray-900")}>
              <Skull size={18} className={overview.bankruptCount > 0 ? "text-red-400" : "text-gray-600"} />
              <div>
                <p className="text-xs text-gray-500">Банкрутств</p>
                <p className={cn("text-lg font-bold", overview.bankruptCount > 0 ? "text-red-400" : "text-white")}>{overview.bankruptCount}</p>
              </div>
            </div>
            <div className={cn("rounded-xl border p-4 flex items-center gap-3", overview.frozenCount > 0 ? "border-amber-900 bg-amber-950/10" : "border-gray-800 bg-gray-900")}>
              <Snowflake size={18} className={overview.frozenCount > 0 ? "text-amber-400" : "text-gray-600"} />
              <div>
                <p className="text-xs text-gray-500">Заморожено операцій</p>
                <p className={cn("text-lg font-bold", overview.frozenCount > 0 ? "text-amber-400" : "text-white")}>{overview.frozenCount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Players tab */}
      {tab === "players" && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Всі гравці ({players.length})</p>
            <p className="text-xs text-gray-500">Сорт. за капіталом ↓</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500">
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Компанія</th>
                  <th className="text-right px-4 py-2 font-medium">Баланс UAH</th>
                  <th className="text-right px-4 py-2 font-medium">Капітал</th>
                  <th className="text-center px-4 py-2 font-medium">Підпр.</th>
                  <th className="text-center px-4 py-2 font-medium">Рейтинг</th>
                  <th className="text-center px-4 py-2 font-medium">Статус</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {players.map((p, i) => (
                  <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{p.companyName}</p>
                      <p className="text-xs text-gray-500">@{p.username}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">₴{formatNumber(Math.round(p.cashBalance))}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">₴{formatNumber(Math.round(p.netWorth))}</td>
                    <td className="px-4 py-3 text-center text-white">{p.enterpriseCount}</td>
                    <td className="px-4 py-3 text-center text-white">{p.creditRating.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center">
                      {p.isBankrupt ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-950 text-red-400">Банкрут</span>
                      ) : p.isOperationsFrozen ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-950 text-amber-400">Заморожен</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400">Активний</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setAdjustTarget(p)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors"
                      >
                        <DollarSign size={12} /> Коригувати
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ticks tab */}
      {tab === "ticks" && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-semibold text-white">Останні тіки ({ticks.length})</p>
          </div>
          <div className="divide-y divide-gray-800">
            {ticks.map((t) => {
              const fast = (t.durationMs ?? 0) < 5000;
              const mid  = (t.durationMs ?? 0) < 15000;
              return (
                <div key={t.tickNumber} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-white w-16">#{t.tickNumber}</span>
                    <div>
                      <p className="text-xs text-gray-500">{t.startedAt ? new Date(t.startedAt).toLocaleString("uk-UA") : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {t.durationMs != null ? (
                      <span className={cn("text-sm font-mono font-semibold",
                        fast ? "text-emerald-400" : mid ? "text-amber-400" : "text-red-400"
                      )}>
                        {t.durationMs < 1000 ? `${t.durationMs}мс` : `${(t.durationMs / 1000).toFixed(1)}с`}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                    {t.completedAt ? (
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    ) : (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Adjust balance modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Коригування балансу</p>
              <button onClick={() => setAdjustTarget(null)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-xs text-gray-500">Гравець</p>
              <p className="text-sm font-semibold text-white">{adjustTarget.companyName}</p>
              <p className="text-xs text-gray-500">Поточний баланс: ₴{formatNumber(Math.round(adjustTarget.cashBalance))}</p>
            </div>
            <div className="space-y-2">
              <input
                type="number" placeholder="Сума (+/-) UAH" value={adjustAmt}
                onChange={(e) => setAdjustAmt(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text" placeholder="Причина (необов'язково)" value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdjustTarget(null)} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">
                Скасувати
              </button>
              <button
                onClick={submitAdjust} disabled={adjusting || !adjustAmt}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {adjusting ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />} Застосувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
