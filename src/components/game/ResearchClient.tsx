"use client";

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Lock, CheckCircle2, Loader2, Zap, Clock, RefreshCw } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

type TechStatus = "UNLOCKED" | "IN_PROGRESS" | "AVAILABLE" | "LOCKED";

interface TechNode {
  code:                   string;
  name:                   string;
  description:            string;
  tier:                   number;
  requiredResearchPoints: number;
  prerequisites:          string[];
  currentProgressPoints:  number;
  isUnlocked:             boolean;
  unlockedAtTick:         number | null;
  status:                 TechStatus;
}

interface Summary {
  total:    number;
  unlocked: number;
  inProgress: {
    code:     string;
    name:     string;
    progress: number;
    required: number;
    eta:      number | null;
  } | null;
}

interface Data {
  techTree:             TechNode[];
  rpPerTick:            number;
  activeResearchTechId: string | null;
  summary:              Summary;
}

const STATUS_CFG: Record<TechStatus, { border: string; bg: string; badge: string; badgeText: string }> = {
  UNLOCKED:    { border: "border-emerald-700/50", bg: "bg-emerald-950/20", badge: "bg-emerald-900/60 text-emerald-300", badgeText: "Відкрито" },
  IN_PROGRESS: { border: "border-blue-600/50",    bg: "bg-blue-950/20",    badge: "bg-blue-900/60 text-blue-300",     badgeText: "Досліджується" },
  AVAILABLE:   { border: "border-gray-700",        bg: "bg-gray-900",       badge: "bg-gray-800 text-gray-400",        badgeText: "Доступно" },
  LOCKED:      { border: "border-gray-800",        bg: "bg-gray-900/40",    badge: "bg-gray-900 text-gray-600",        badgeText: "Заблоковано" },
};

const TIER_LABELS: Record<number, string> = {
  1: "Рівень 1 — Базові",
  2: "Рівень 2 — Розширені",
  3: "Рівень 3 — Передові",
};

export default function ResearchClient() {
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/research");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setActive(techCode: string | null) {
    setSetting(techCode ?? "none");
    const res = await fetch("/api/research", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ techCode }),
    });
    if (res.ok) await load();
    setSetting(null);
  }

  if (loading) return (
    <div className="space-y-4 max-w-4xl mx-auto px-4 py-8">
      {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />)}
    </div>
  );

  if (!data) return <p className="text-red-400 p-8">Помилка завантаження</p>;

  const { techTree, rpPerTick, summary } = data;
  const tiers = [...new Set(techTree.map(t => t.tier))].sort();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FlaskConical size={22} className="text-purple-400" /> Дослідження та розробки
        </h1>
        <p className="text-gray-500 text-sm mt-1">Розблоковуйте технології щоб отримати постійні бонуси виробництва</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">RP / тік</p>
          <p className="text-xl font-bold text-purple-400 font-mono">+{rpPerTick.toFixed(1)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">очки досліджень</p>
        </div>
        <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
          <p className="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-1">Відкрито</p>
          <p className="text-xl font-bold text-emerald-400 font-mono">{summary.unlocked} / {summary.total}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Зараз досліджується</p>
          {summary.inProgress ? (
            <>
              <p className="text-sm font-semibold text-white truncate">{summary.inProgress.name}</p>
              <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (summary.inProgress.progress / summary.inProgress.required) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {formatNumber(Math.round(summary.inProgress.progress))} / {formatNumber(summary.inProgress.required)} RP
                {summary.inProgress.eta !== null && ` · ~${summary.inProgress.eta} тіків`}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600 mt-1">Нічого не досліджується</p>
          )}
        </div>
      </div>

      {/* Tech tree by tier */}
      {tiers.map(tier => {
        const nodes = techTree.filter(t => t.tier === tier);
        return (
          <div key={tier}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {TIER_LABELS[tier] ?? `Рівень ${tier}`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {nodes.map(node => {
                const cfg     = STATUS_CFG[node.status];
                const pct     = node.requiredResearchPoints > 0
                  ? Math.min(100, (node.currentProgressPoints / node.requiredResearchPoints) * 100)
                  : 0;
                const isActive = node.status === "IN_PROGRESS";
                const canStart = node.status === "AVAILABLE";
                const isBusy   = setting === node.code || (setting === "none" && isActive);

                return (
                  <div
                    key={node.code}
                    className={cn(
                      "rounded-xl border px-4 py-4 space-y-2 transition-all",
                      cfg.border, cfg.bg,
                      node.status === "LOCKED" && "opacity-50",
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">{node.name}</span>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", cfg.badge)}>
                            {cfg.badgeText}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{node.description}</p>
                      </div>
                      {node.status === "UNLOCKED" && <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />}
                      {node.status === "LOCKED"   && <Lock size={15} className="text-gray-700 shrink-0 mt-0.5" />}
                    </div>

                    {/* Progress bar */}
                    {(node.status === "IN_PROGRESS" || (node.currentProgressPoints > 0 && node.status !== "UNLOCKED")) && (
                      <div>
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                          <span>{formatNumber(Math.round(node.currentProgressPoints))} / {formatNumber(node.requiredResearchPoints)} RP</span>
                          <span>{pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", isActive ? "bg-blue-500" : "bg-gray-600")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {isActive && rpPerTick > 0 && (
                          <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
                            <Clock size={9} />
                            ~{Math.ceil((node.requiredResearchPoints - node.currentProgressPoints) / rpPerTick)} тіків до відкриття
                          </p>
                        )}
                      </div>
                    )}

                    {/* Cost for not-started available */}
                    {node.status === "AVAILABLE" && node.currentProgressPoints === 0 && (
                      <p className="text-[10px] text-gray-500">
                        Потрібно:{" "}
                        <span className="text-purple-400 font-mono">{formatNumber(node.requiredResearchPoints)} RP</span>
                        {rpPerTick > 0 && ` · ~${Math.ceil(node.requiredResearchPoints / rpPerTick)} тіків`}
                      </p>
                    )}

                    {/* Prerequisites info for locked */}
                    {node.status === "LOCKED" && node.prerequisites.length > 0 && (
                      <p className="text-[10px] text-gray-600">Потребує: {node.prerequisites.join(", ")}</p>
                    )}

                    {/* Unlocked tick */}
                    {node.status === "UNLOCKED" && node.unlockedAtTick && (
                      <p className="text-[10px] text-gray-600">Відкрито на тіку #{node.unlockedAtTick}</p>
                    )}

                    {/* Actions */}
                    {canStart && (
                      <button
                        onClick={() => setActive(node.code)}
                        disabled={!!setting}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white transition-colors font-medium"
                      >
                        {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                        Розпочати дослідження
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => setActive(null)}
                        disabled={!!setting}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 transition-colors"
                      >
                        {isBusy ? <Loader2 size={11} className="animate-spin" /> : null}
                        Зупинити дослідження
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button onClick={load} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors mx-auto pt-2">
        <RefreshCw size={10} /> Оновити
      </button>
    </div>
  );
}
