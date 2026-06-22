"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, TrendingDown, AlertTriangle, ChevronDown, ChevronUp, Check, X, Pencil } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleData {
  id               : string;
  name             : string;
  productivityWeight: number;
  marketSalaryLocal: number;
  salaryOffered    : number;
  workerCount      : number;
  mood             : number;
  moodStatus       : string;
  moodLabel        : string;
  salaryRatio      : number;
}

interface EntData {
  id             : string;
  name           : string;
  cityName       : string;
  typeName       : string;
  category       : string;
  workersCurrent : number;
  workersMax     : number;
  fillRate       : number;
  mood           : number;
  moodStatus     : string;
  moodLabel      : string;
  isOnStrike     : boolean;
  strikeEndsAt   : number | null;
  totalSalaryPerTick: number;
  roles          : RoleData[];
}

interface HrData {
  enterprises: EntData[];
  summary: {
    totalWorkers      : number;
    maxWorkers        : number;
    fillRate          : number;
    totalSalaryPerTick: number;
    avgMood           : number;
    enterprisesOnStrike: number;
  };
}

// ─── Mood colors ──────────────────────────────────────────────────────────────

const MOOD_COLOR: Record<string, string> = {
  OPTIMAL: "text-emerald-400",
  GOOD   : "text-green-400",
  NORMAL : "text-yellow-400",
  WARNING: "text-orange-400",
  DANGER : "text-red-400",
  STRIKE : "text-red-600",
};

const MOOD_BAR: Record<string, string> = {
  OPTIMAL: "bg-emerald-500",
  GOOD   : "bg-green-500",
  NORMAL : "bg-yellow-500",
  WARNING: "bg-orange-500",
  DANGER : "bg-red-500",
  STRIKE : "bg-red-700",
};

// ─── MoodBar ──────────────────────────────────────────────────────────────────

function MoodBar({ mood, status }: { mood: number; status: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", MOOD_BAR[status] ?? "bg-gray-500")}
          style={{ width: `${mood}%` }}
        />
      </div>
      <span className={cn("text-xs font-mono w-9 text-right shrink-0", MOOD_COLOR[status] ?? "text-gray-400")}>
        {mood}%
      </span>
    </div>
  );
}

// ─── Inline salary editor ─────────────────────────────────────────────────────

function SalaryEditor({
  enterpriseId, role, onSaved,
}: {
  enterpriseId: string;
  role: RoleData;
  onSaved: (roleId: string, newSalary: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(role.salaryOffered);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { setValue(role.salaryOffered); }, [role.salaryOffered]);

  async function save() {
    if (value <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/enterprises/${enterpriseId}/hr`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: role.id, salary: value }),
      });
      if (res.ok) {
        onSaved(role.id, value);
        setEditing(false);
      }
    } finally { setSaving(false); }
  }

  const ratio  = role.marketSalaryLocal > 0 ? Math.round((value / role.marketSalaryLocal) * 100) : 100;
  const ratioColor = ratio >= 120 ? "text-emerald-400" : ratio >= 100 ? "text-green-400" : ratio >= 80 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <>
          <input
            type="number"
            min={1}
            step={100}
            value={value}
            autoFocus
            onChange={(e) => setValue(Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-28 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 [appearance:textfield]"
          />
          <span className={cn("text-[10px] font-mono", ratioColor)}>{ratio}%</span>
          <button onClick={save} disabled={saving} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40">
            <Check size={13} />
          </button>
          <button onClick={() => { setEditing(false); setValue(role.salaryOffered); }} className="text-gray-500 hover:text-white">
            <X size={13} />
          </button>
        </>
      ) : (
        <>
          <span className="font-mono text-xs text-white">{formatNumber(role.salaryOffered)} GC</span>
          <span className={cn("text-[10px] font-mono", ratioColor)}>({ratio}%)</span>
          <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-300 transition-colors">
            <Pencil size={11} />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Enterprise row ───────────────────────────────────────────────────────────

function EnterpriseRow({ ent, tickNumber }: { ent: EntData; tickNumber: number }) {
  const [open,  setOpen]  = useState(false);
  const [roles, setRoles] = useState(ent.roles);

  function handleSalaryUpdate(roleId: string, newSalary: number) {
    setRoles((prev) => prev.map((r) => r.id === roleId ? { ...r, salaryOffered: newSalary } : r));
  }

  return (
    <div className={cn(
      "rounded-xl border bg-gray-900 transition-all",
      ent.isOnStrike ? "border-red-800 bg-red-950/20" : "border-gray-800"
    )}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Strike badge */}
        {ent.isOnStrike && (
          <span className="shrink-0 text-[10px] font-bold bg-red-900/60 text-red-300 border border-red-700 px-1.5 py-0.5 rounded">
            СТРАЙК до #{ent.strikeEndsAt}
          </span>
        )}

        {/* Name + city */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{ent.name}</p>
          <p className="text-[11px] text-gray-500">{ent.cityName} · {ent.typeName}</p>
        </div>

        {/* Fill rate */}
        <div className="shrink-0 text-center w-20 hidden sm:block">
          <p className="text-[10px] text-gray-600 mb-0.5">Персонал</p>
          <p className="text-xs text-white font-mono">
            {ent.workersCurrent}<span className="text-gray-600">/{ent.workersMax}</span>
            <span className="text-gray-600 ml-1">({ent.fillRate}%)</span>
          </p>
        </div>

        {/* Mood */}
        <div className="shrink-0 w-32 hidden md:block">
          <p className="text-[10px] text-gray-600 mb-1">Задоволеність</p>
          <MoodBar mood={ent.mood} status={ent.moodStatus} />
        </div>

        {/* Salary */}
        <div className="shrink-0 text-right w-24 hidden lg:block">
          <p className="text-[10px] text-gray-600 mb-0.5">ЗП/тік</p>
          <p className="text-xs text-red-400 font-mono">−{formatNumber(Math.round(ent.totalSalaryPerTick))}</p>
        </div>

        <ChevronDown size={16} className={cn("text-gray-600 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {/* Expanded roles */}
      {open && (
        <div className="border-t border-gray-800 px-4 py-3">
          {/* Mobile stats */}
          <div className="flex gap-4 mb-3 sm:hidden text-xs">
            <span className="text-gray-500">Персонал: <span className="text-white">{ent.workersCurrent}/{ent.workersMax}</span></span>
            <span className="text-gray-500">ЗП: <span className="text-red-400">−{formatNumber(Math.round(ent.totalSalaryPerTick))} GC/тік</span></span>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800/50">
                <th className="text-left pb-2 font-normal">Роль</th>
                <th className="text-right pb-2 font-normal">Прац.</th>
                <th className="text-right pb-2 font-normal">Ринок</th>
                <th className="text-right pb-2 font-normal">Запропонована ЗП</th>
                <th className="text-right pb-2 font-normal hidden sm:table-cell">Настрій</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              {roles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-800/20">
                  <td className="py-2 text-gray-300">{role.name}</td>
                  <td className="py-2 text-right text-gray-400 font-mono">{role.workerCount}</td>
                  <td className="py-2 text-right text-gray-500 font-mono">{formatNumber(role.marketSalaryLocal)}</td>
                  <td className="py-2 text-right">
                    <SalaryEditor
                      enterpriseId={ent.id}
                      role={role}
                      onSaved={handleSalaryUpdate}
                    />
                  </td>
                  <td className="py-2 hidden sm:table-cell">
                    <div className="flex justify-end">
                      <div className="w-28">
                        <MoodBar mood={role.mood} status={role.moodStatus} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[10px] text-gray-700 mt-3">
            ЗП ≥ 120% ринку = 100% настрій · ≥ 100% = 80%+ · нижче ринку → квадратичне падіння · {`<`}30% = ризик страйку
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type FilterKey = "all" | "strike" | "low" | "unfilled";

export default function EmployeesClient() {
  const [data,    setData]    = useState<HrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FilterKey>("all");
  const [sort,    setSort]    = useState<"mood" | "salary" | "fill">("mood");

  const load = useCallback(async () => {
    const res = await fetch("/api/hr");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Завантаження персоналу...</div>;
  if (!data)   return null;

  const { summary, enterprises } = data;

  const FILTER_FNS: Record<FilterKey, (e: EntData) => boolean> = {
    all     : ()  => true,
    strike  : (e) => e.isOnStrike,
    low     : (e) => !e.isOnStrike && e.mood < 60,
    unfilled: (e) => e.fillRate < 80,
  };

  const SORT_FNS: Record<"mood" | "salary" | "fill", (a: EntData, b: EntData) => number> = {
    mood  : (a, b) => a.mood - b.mood,
    salary: (a, b) => b.totalSalaryPerTick - a.totalSalaryPerTick,
    fill  : (a, b) => a.fillRate - b.fillRate,
  };

  const filtered = enterprises.filter(FILTER_FNS[filter]).sort(SORT_FNS[sort]);

  const filterCounts: Record<FilterKey, number> = {
    all     : enterprises.length,
    strike  : enterprises.filter(FILTER_FNS.strike).length,
    low     : enterprises.filter(FILTER_FNS.low).length,
    unfilled: enterprises.filter(FILTER_FNS.unfilled).length,
  };

  const moodBarColor = summary.avgMood >= 80 ? "bg-emerald-500" : summary.avgMood >= 60 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users size={22} className="text-emerald-400" /> Управління персоналом
        </h1>
        <p className="text-gray-500 text-sm mt-1">Зарплати, задоволеність та страйки по всіх підприємствах</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Всього працівників</p>
          <p className="text-xl font-bold text-white font-mono">
            {summary.totalWorkers}
            <span className="text-gray-600 text-sm font-normal">/{summary.maxWorkers}</span>
          </p>
          <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${summary.fillRate}%` }} />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
            <TrendingDown size={10} /> ЗП/тік
          </p>
          <p className="text-xl font-bold text-red-400 font-mono">
            −{formatNumber(summary.totalSalaryPerTick)}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">GC загалом</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Сер. задоволеність</p>
          <p className={cn("text-xl font-bold font-mono", summary.avgMood >= 80 ? "text-emerald-400" : summary.avgMood >= 60 ? "text-yellow-400" : "text-red-400")}>
            {summary.avgMood}%
          </p>
          <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", moodBarColor)} style={{ width: `${summary.avgMood}%` }} />
          </div>
        </div>

        <div className={cn(
          "rounded-xl px-4 py-3 border",
          summary.enterprisesOnStrike > 0
            ? "bg-red-950/30 border-red-800"
            : "bg-gray-900 border-gray-800"
        )}>
          <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
            <AlertTriangle size={10} /> На страйку
          </p>
          <p className={cn("text-xl font-bold font-mono", summary.enterprisesOnStrike > 0 ? "text-red-400" : "text-gray-500")}>
            {summary.enterprisesOnStrike}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">підприємств</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all",      label: "Всі" },
            { key: "strike",   label: "Страйк", color: "text-red-400" },
            { key: "low",      label: "Низький настрій", color: "text-orange-400" },
            { key: "unfilled", label: "Не заповнені" },
          ] as { key: FilterKey; label: string; color?: string }[]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                filter === key ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              )}
            >
              {label}
              {filterCounts[key] > 0 && key !== "all" && (
                <span className={cn("ml-1.5 text-[10px]", filter === key ? "text-emerald-200" : color ?? "text-gray-600")}>
                  {filterCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Сортування:</span>
          {([
            { key: "mood",   label: "Настрій ↑" },
            { key: "salary", label: "ЗП ↓" },
            { key: "fill",   label: "Заповненість ↑" },
          ] as { key: "mood" | "salary" | "fill"; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all",
                sort === key ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          {filter === "strike" ? "Немає підприємств на страйку" :
           filter === "low"    ? "Всі підприємства мають нормальний настрій" :
           filter === "unfilled" ? "Всі підприємства повністю укомплектовані" :
           "Немає підприємств"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ent) => (
            <EnterpriseRow key={ent.id} ent={ent} tickNumber={0} />
          ))}
        </div>
      )}
    </div>
  );
}
