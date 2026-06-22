"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus, Building2, Users, Zap, AlertCircle, AlertTriangle,
  Wrench, Hammer, BookX, ArrowUpRight, ArrowDownRight,
  ChevronRight, Search, X, List, LayoutGrid,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EnterpriseCategoryBadge } from "@/components/game/EnterpriseCategoryBadge";
import { CurrencyDisplay } from "@/components/game/CurrencyDisplay";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnterpriseSummary {
  id: string; name: string;
  category: "EXTRACTION" | "PRODUCTION" | "TRADE" | "LOGISTICS";
  typeName: string; typeIcon: string | null; cityName: string;
  level: number; size: number;
  workersCurrent: number; workersMax: number;
  quality: number; efficiency: number;
  isActive: boolean; strikeEndsAt: number | null;
  rentPerTick: number; salaryPerTick: number; lastTickNet: number | null;
  wornEquip: number; brokenEquip: number;
  totalLines: number; linesNoRecipe: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATS = ["ALL", "EXTRACTION", "PRODUCTION", "TRADE", "LOGISTICS"] as const;
type CatFilter = typeof CATS[number];

const CAT_LABELS: Record<string, string> = {
  ALL: "Всі", EXTRACTION: "Видобуток", PRODUCTION: "Виробництво",
  TRADE: "Торгівля", LOGISTICS: "Логістика",
};

// ─── Enterprise Card ──────────────────────────────────────────────────────────

function EnterpriseCard({ e, currentTick }: { e: EnterpriseSummary; currentTick: number }) {
  const effPct    = Math.round(e.efficiency * 100);
  const isStrike  = e.strikeEndsAt !== null && e.strikeEndsAt > currentTick;
  const hasBroken = e.brokenEquip > 0;
  const hasWorn   = e.wornEquip > 0;
  const hasIssue  = !e.isActive || isStrike || hasBroken || e.linesNoRecipe > 0;
  const hasWarn   = !hasIssue && hasWorn;

  const workerFill = e.workersMax > 0 ? e.workersCurrent / e.workersMax : 0;
  const isProfit   = e.lastTickNet !== null && e.lastTickNet >= 0;

  return (
    <div className={cn(
      "rounded-xl border bg-gray-900 p-4 flex flex-col gap-3 transition-colors",
      hasBroken || isStrike  ? "border-red-500/40"
        : e.linesNoRecipe > 0 ? "border-amber-500/30"
        : hasWorn              ? "border-amber-500/20"
        : e.isActive           ? "border-gray-800"
        : "border-gray-800 opacity-60",
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none shrink-0 mt-0.5">{e.typeIcon ?? "🏭"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/enterprises/${e.id}`}
              className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors truncate"
            >
              {e.name}
            </Link>
            {(hasBroken || isStrike) && <AlertCircle size={12} className="text-red-400 shrink-0" />}
            {!hasBroken && !isStrike && (hasWorn || e.linesNoRecipe > 0) && (
              <AlertTriangle size={12} className="text-amber-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{e.typeName} · {e.cityName}</p>
        </div>
        <EnterpriseCategoryBadge category={e.category} />
      </div>

      {/* Status chips */}
      {(isStrike || !e.isActive) && (
        <div className="flex gap-1.5 flex-wrap">
          {isStrike && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
              <AlertCircle size={9} /> Страйк до тіку #{e.strikeEndsAt}
            </span>
          )}
          {!e.isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
              Зупинено
            </span>
          )}
        </div>
      )}

      {/* Efficiency */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Zap size={9} /> Ефективність
          </span>
          <span className="text-xs font-mono text-white">{effPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              effPct >= 80 ? "bg-emerald-500" : effPct >= 50 ? "bg-amber-500" : "bg-red-500",
            )}
            style={{ width: `${effPct}%` }}
          />
        </div>
      </div>

      {/* Workers + Last tick P&L */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <Users size={9} /> Персонал
            </span>
            <span className="text-[10px] font-mono text-gray-400">
              {e.workersCurrent}/{e.workersMax}
            </span>
          </div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, workerFill * 100)}%` }}
            />
          </div>
        </div>

        {e.lastTickNet !== null ? (
          <div className={cn(
            "text-xs font-mono font-semibold flex items-center gap-0.5 shrink-0",
            isProfit ? "text-emerald-400" : "text-red-400",
          )}>
            {isProfit ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {isProfit ? "+" : ""}{formatNumber(Math.round(e.lastTickNet))} GC
          </div>
        ) : (
          <span className="text-xs text-gray-600 shrink-0">—</span>
        )}
      </div>

      {/* Equipment + Lines */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasBroken && (
          <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/15 rounded px-1.5 py-0.5">
            <Hammer size={9} /> {e.brokenEquip} зламано
          </span>
        )}
        {hasWorn && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/15 rounded px-1.5 py-0.5">
            <Wrench size={9} /> {e.wornEquip} зношено
          </span>
        )}
        {e.linesNoRecipe > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/15 rounded px-1.5 py-0.5">
            <BookX size={9} /> {e.linesNoRecipe} без рецепту
          </span>
        )}
        {!hasBroken && !hasWorn && e.linesNoRecipe === 0 && e.totalLines > 0 && (
          <span className="text-[10px] text-emerald-500/70">
            ✓ {e.totalLines} {e.totalLines === 1 ? "лінія" : "лінії"} в нормі
          </span>
        )}
        <span className="text-[10px] text-gray-600 ml-auto">
          −{formatNumber(Math.round(e.rentPerTick + e.salaryPerTick))} GC/тік
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-800 mt-auto">
        <Link
          href={`/enterprises/${e.id}`}
          className="flex-1 text-center text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg py-1.5 transition-colors"
        >
          Деталі
        </Link>
        <Link
          href={`/enterprises/${e.id}?tab=workshops`}
          className="flex-1 text-center text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg py-1.5 transition-colors"
        >
          🏭 Цехи
        </Link>
        <Link
          href={`/enterprises/${e.id}?tab=hr`}
          className="flex-1 text-center text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg py-1.5 transition-colors"
        >
          👥 HR
        </Link>
      </div>
    </div>
  );
}

// ─── Table Row (compact view) ─────────────────────────────────────────────────

function EnterpriseRow({ e, currentTick }: { e: EnterpriseSummary; currentTick: number }) {
  const effPct   = Math.round(e.efficiency * 100);
  const isStrike = e.strikeEndsAt !== null && e.strikeEndsAt > currentTick;
  const isProfit = e.lastTickNet !== null && e.lastTickNet >= 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
      <span className="text-xl shrink-0">{e.typeIcon ?? "🏭"}</span>
      <div className="min-w-0 flex-1">
        <Link href={`/enterprises/${e.id}`} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors">
          {e.name}
        </Link>
        <p className="text-xs text-gray-600">{e.typeName} · {e.cityName}</p>
      </div>
      <EnterpriseCategoryBadge category={e.category} />
      <div className="w-20 hidden sm:block">
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", effPct >= 80 ? "bg-emerald-500" : effPct >= 50 ? "bg-amber-500" : "bg-red-500")}
            style={{ width: `${effPct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 text-right mt-0.5">{effPct}%</p>
      </div>
      <div className="w-20 text-right hidden md:block">
        {e.lastTickNet !== null ? (
          <span className={cn("text-xs font-mono", isProfit ? "text-emerald-400" : "text-red-400")}>
            {isProfit ? "+" : ""}{formatNumber(Math.round(e.lastTickNet))}
          </span>
        ) : <span className="text-xs text-gray-600">—</span>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {e.brokenEquip > 0 && <AlertCircle size={13} className="text-red-400" />}
        {isStrike && <AlertCircle size={13} className="text-red-400" />}
        {!e.brokenEquip && !isStrike && e.wornEquip > 0 && <AlertTriangle size={13} className="text-amber-400" />}
        {!e.brokenEquip && !isStrike && e.linesNoRecipe > 0 && <BookX size={13} className="text-amber-400" />}
        <Link href={`/enterprises/${e.id}`} className="text-gray-500 hover:text-white transition-colors">
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({ list }: { list: EnterpriseSummary[] }) {
  if (list.length === 0) return null;
  const totalCosts = list.reduce((s, e) => s + e.rentPerTick + e.salaryPerTick, 0);
  const avgEff     = list.reduce((s, e) => s + e.efficiency, 0) / list.length * 100;
  const totalNet   = list.filter((e) => e.lastTickNet !== null).reduce((s, e) => s + (e.lastTickNet ?? 0), 0);
  const hasNetData = list.some((e) => e.lastTickNet !== null);
  const alerts     = list.filter((e) => e.brokenEquip > 0 || e.linesNoRecipe > 0).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: "Витрати / тік", value: `-${formatNumber(Math.round(totalCosts))} GC`, color: "text-orange-400" },
        { label: "Сер. ефективність", value: `${avgEff.toFixed(0)}%`, color: avgEff >= 70 ? "text-emerald-400" : "text-amber-400" },
        {
          label: "Тік (чистий прибуток)",
          value: hasNetData ? `${totalNet >= 0 ? "+" : ""}${formatNumber(Math.round(totalNet))} GC` : "—",
          color: !hasNetData ? "text-gray-500" : totalNet >= 0 ? "text-emerald-400" : "text-red-400",
        },
        {
          label: "Потребують уваги",
          value: alerts > 0 ? `${alerts} підпр.` : "Все OK",
          color: alerts > 0 ? "text-amber-400" : "text-emerald-400",
        },
      ].map(({ label, value, color }) => (
        <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
          <p className={cn("text-sm font-semibold font-mono", color)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EnterprisesPage() {
  const [enterprises, setEnterprises] = useState<EnterpriseSummary[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [cat,         setCat]         = useState<CatFilter>("ALL");
  const [query,       setQuery]       = useState("");
  const [view,        setView]        = useState<"grid" | "list">("grid");
  const currentTick = 0; // fallback — tick not fetched here

  useEffect(() => {
    fetch("/api/enterprises")
      .then((r) => r.json())
      .then((d) => setEnterprises(d.enterprises ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = enterprises;
    if (cat !== "ALL") list = list.filter((e) => e.category === cat);
    if (query.trim())  list = list.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()) || e.typeName.toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [enterprises, cat, query]);

  const countByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of enterprises) m[e.category] = (m[e.category] ?? 0) + 1;
    return m;
  }, [enterprises]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Підприємства</h1>
          {!loading && (
            <p className="text-gray-500 text-sm mt-0.5">
              {enterprises.length} об&apos;єктів · {enterprises.filter((e) => e.isActive).length} активних
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук…"
              className="w-44 rounded-lg border border-gray-800 bg-gray-900 pl-7 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={11} />
              </button>
            )}
          </div>
          {/* View toggle */}
          <div className="flex border border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={cn("p-2 transition-colors", view === "grid" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white")}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("p-2 transition-colors", view === "list" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white")}
            >
              <List size={14} />
            </button>
          </div>
          <Link href="/enterprises/create">
            <Button size="sm"><Plus size={14} /> Нове</Button>
          </Link>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && <SummaryStrip list={filtered} />}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              cat === c
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700",
            )}
          >
            {CAT_LABELS[c]}
            <span className={cn("ml-1.5 text-[10px] font-normal", cat === c ? "text-emerald-200" : "text-gray-600")}>
              {c === "ALL" ? enterprises.length : (countByCat[c] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-1 w-full rounded-full" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-gray-900 space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                <Skeleton className="w-8 h-8 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Building2 size={28} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {enterprises.length === 0
              ? "Підприємств ще немає"
              : "Нічого не знайдено"}
          </p>
          {enterprises.length === 0 && (
            <Link href="/enterprises/create" className="mt-3 inline-block">
              <Button size="sm" className="mt-2"><Plus size={13} /> Відкрити перше</Button>
            </Link>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e) => (
            <EnterpriseCard key={e.id} e={e} currentTick={currentTick} />
          ))}
          <Link href="/enterprises/create" className="rounded-xl border border-dashed border-gray-800 flex flex-col items-center justify-center gap-2 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-all min-h-[200px]">
            <Plus size={20} />
            <span className="text-xs">Нове підприємство</span>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {filtered.map((e) => (
            <EnterpriseRow key={e.id} e={e} currentTick={currentTick} />
          ))}
        </div>
      )}
    </div>
  );
}
