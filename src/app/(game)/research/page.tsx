"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FlaskConical, Lock, CheckCircle2, Zap, Loader2,
  ChevronRight, Star, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TechNode {
  code: string;
  name: string;
  description: string;
  tier: number;
  requiredResearchPoints: number;
  prerequisites: string[];
  currentProgressPoints: number;
  isUnlocked: boolean;
  unlockedAtTick: number | null;
  status: "UNLOCKED" | "IN_PROGRESS" | "AVAILABLE" | "LOCKED";
}

interface ResearchData {
  techTree: TechNode[];
  rpPerTick: number;
  activeResearchTechId: string | null;
  summary: {
    total: number;
    unlocked: number;
    inProgress: {
      code: string; name: string;
      progress: number; required: number; eta: number | null;
    } | null;
  };
}

const TECH_ICONS: Record<string, string> = {
  LEAN_PRODUCTION:    "⚙️",
  GREEN_ENERGY:       "🌱",
  ADVANCED_LOGISTICS: "🚛",
  HIGH_TECH_AGRO:     "🌾",
};

const STATUS_CONFIG = {
  UNLOCKED:    { label: "Розблоковано", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", ring: "border-emerald-500/50" },
  IN_PROGRESS: { label: "Досліджується", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30",    ring: "border-blue-500/50"    },
  AVAILABLE:   { label: "Доступна",     color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30",  ring: "border-amber-500/40"   },
  LOCKED:      { label: "Заблоковано",  color: "text-gray-600",    bg: "bg-gray-900 border-gray-800",          ring: "border-gray-800"       },
};

function TechCard({
  tech, rpPerTick, onSetActive, onUnlock, loading,
}: {
  tech: TechNode;
  rpPerTick: number;
  onSetActive: (code: string) => void;
  onUnlock: (code: string) => void;
  loading: string | null;
}) {
  const cfg = STATUS_CONFIG[tech.status];
  const pct = tech.requiredResearchPoints > 0
    ? Math.min(100, (tech.currentProgressPoints / tech.requiredResearchPoints) * 100)
    : 0;
  const eta = tech.status === "IN_PROGRESS" && rpPerTick > 0
    ? Math.ceil((tech.requiredResearchPoints - tech.currentProgressPoints) / rpPerTick)
    : null;
  const canUnlock = !tech.isUnlocked && tech.currentProgressPoints >= tech.requiredResearchPoints;

  return (
    <div className={cn("rounded-xl border p-4 space-y-3 transition-all", cfg.ring)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{TECH_ICONS[tech.code] ?? "🔬"}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">{tech.name}</h3>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Tier {tech.tier}</p>
          </div>
        </div>
        {tech.status === "UNLOCKED" && <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />}
        {tech.status === "LOCKED"   && <Lock size={14} className="text-gray-600 flex-shrink-0 mt-0.5" />}
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">{tech.description}</p>

      {tech.prerequisites.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-600">Потрібно:</span>
          {tech.prerequisites.map(p => (
            <span key={p} className="text-[10px] text-gray-500 flex items-center gap-1">
              <ChevronRight size={8} />{p.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {!tech.isUnlocked && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{tech.currentProgressPoints.toFixed(0)} / {tech.requiredResearchPoints} RP</span>
            {eta !== null && <span className="text-blue-400">~{eta} тіків</span>}
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", tech.status === "IN_PROGRESS" ? "bg-blue-500" : "bg-gray-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {!tech.isUnlocked && tech.status !== "LOCKED" && (
        <div className="flex gap-2">
          {tech.status === "AVAILABLE" && (
            <Button
              size="sm" variant="outline" className="flex-1 text-xs"
              disabled={!!loading}
              onClick={() => onSetActive(tech.code)}
            >
              {loading === tech.code ? <Loader2 size={11} className="animate-spin mr-1" /> : null}
              Досліджувати
            </Button>
          )}
          {tech.status === "IN_PROGRESS" && (
            <Button
              size="sm" variant="outline" className="flex-1 text-xs border-gray-700 text-gray-400"
              disabled={!!loading}
              onClick={() => onSetActive("")}
            >
              Призупинити
            </Button>
          )}
          {canUnlock && (
            <Button
              size="sm" className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500"
              disabled={!!loading}
              onClick={() => onUnlock(tech.code)}
            >
              {loading === `unlock-${tech.code}` ? <Loader2 size={11} className="animate-spin mr-1" /> : null}
              Розблокувати
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResearchPage() {
  const [data,    setData]    = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [action,  setAction]  = useState<string | null>(null);
  const [error,   setError]   = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/research")
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setActive(code: string) {
    setAction(code || "clear"); setError("");
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ techCode: code || null }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Помилка"); setAction(null); return; }
    setAction(null);
    load();
  }

  async function unlock(code: string) {
    setAction(`unlock-${code}`); setError("");
    const res = await fetch("/api/research/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ techCode: code }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Помилка"); setAction(null); return; }
    setAction(null);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 rounded bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <div className="py-16 text-center text-gray-500">Помилка завантаження</div>;

  const { techTree, rpPerTick, summary } = data;
  const tier1 = techTree.filter(t => t.tier === 1);
  const tier2 = techTree.filter(t => t.tier === 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FlaskConical size={20} className="text-purple-400" /> Дослідження та розробка
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Розблокуйте технології, щоб підвищити ефективність бізнесу</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">RP / тік</p>
          <p className="text-lg font-bold font-mono text-purple-400 mt-0.5 flex items-center gap-1">
            <Zap size={14} /> {rpPerTick.toFixed(1)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Розблоковано</p>
          <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
            {summary.unlocked} / {summary.total}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Прогрес</p>
          <p className="text-lg font-bold font-mono text-white mt-0.5">
            {summary.total > 0 ? Math.round((summary.unlocked / summary.total) * 100) : 0}%
          </p>
        </div>
      </div>

      {summary.inProgress && (
        <div className="flex items-center gap-4 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3">
          <Loader2 size={16} className="text-blue-400 animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium">Досліджується: {summary.inProgress.name}</p>
            <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.min(100, (summary.inProgress.progress / summary.inProgress.required) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-mono text-blue-400">
              {summary.inProgress.progress.toFixed(0)} / {summary.inProgress.required} RP
            </p>
            {summary.inProgress.eta && (
              <p className="text-[10px] text-gray-500 mt-0.5">~{summary.inProgress.eta} тіків</p>
            )}
          </div>
        </div>
      )}

      {rpPerTick === 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={14} />
          Немає R&D лабораторій з дослідниками. Побудуйте <strong className="mx-1">RD_LABORATORY</strong> та найміть RESEARCHER або DATA_SCIENTIST.
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Рівень 1 — Базові технології</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tier1.map(t => (
            <TechCard key={t.code} tech={t} rpPerTick={rpPerTick} onSetActive={setActive} onUnlock={unlock} loading={action} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-purple-400" />
          <Star size={14} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-white">Рівень 2 — Просунуті технології</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tier2.map(t => (
            <TechCard key={t.code} tech={t} rpPerTick={rpPerTick} onSetActive={setActive} onUnlock={unlock} loading={action} />
          ))}
        </div>
      </div>
    </div>
  );
}
