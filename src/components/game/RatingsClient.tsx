"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Trophy, Star, Building2, TrendingUp, Crown, Medal,
  Search, RefreshCw, Factory, Users, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow {
  rank: number;
  id: string;
  name: string;
  slogan: null;
  rating: number;       // 0-100
  brandLevel: number;   // 1-5
  totalAssets: number;
  netWorth: number;
  gameCash: number;
  ownerUsername: string;
  ownerLevel: number;
  isMyCompany: boolean;
  enterprises: number;
  activeEnterprises: number;
  createdAt: string;
}

type SortKey = "capital" | "rating" | "enterprises";

const SORT_META: { key: SortKey; label: string; icon: React.ElementType }[] = [
  { key: "capital",     label: "За капіталом",     icon: TrendingUp },
  { key: "rating",      label: "За рейтингом",     icon: BarChart2  },
  { key: "enterprises", label: "За підприємствами", icon: Factory    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function medalEmoji(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

function podiumBorder(rank: number) {
  if (rank === 1) return "border-yellow-400/40 bg-yellow-400/5";
  if (rank === 2) return "border-gray-300/30 bg-gray-300/5";
  return "border-amber-600/30 bg-amber-600/5";
}

function podiumLabel(rank: number) {
  if (rank === 1) return { text: "1 місце", color: "text-yellow-400" };
  if (rank === 2) return { text: "2 місце", color: "text-gray-300"   };
  return              { text: "3 місце", color: "text-amber-600"   };
}

function ratingBarColor(r: number) {
  if (r >= 75) return "bg-emerald-500";
  if (r >= 50) return "bg-yellow-400";
  if (r >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function ratingTextColor(r: number) {
  if (r >= 75) return "text-emerald-400";
  if (r >= 50) return "text-yellow-400";
  if (r >= 25) return "text-amber-400";
  return "text-red-400";
}

// ─── Podium card ─────────────────────────────────────────────────────────────

function PodiumCard({ c }: { c: CompanyRow }) {
  const lbl = podiumLabel(c.rank);
  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 flex flex-col gap-2 transition-all",
        podiumBorder(c.rank),
        c.isMyCompany && "ring-1 ring-blue-500/30",
        c.rank === 1 && "sm:scale-[1.03] sm:z-10 sm:shadow-yellow-400/10 sm:shadow-lg",
      )}
    >
      {/* position label */}
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-bold uppercase tracking-wider", lbl.color)}>{lbl.text}</span>
        <span className="text-xl leading-none">{medalEmoji(c.rank)}</span>
      </div>

      {/* company name */}
      <div>
        <p className={cn("font-bold text-base leading-tight", c.isMyCompany ? "text-blue-400" : "text-white")}>
          {c.name}
          {c.isMyCompany && <span className="ml-1.5 text-xs text-blue-500">(ви)</span>}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          <Users size={10} className="inline mr-0.5" />
          {c.ownerUsername} · Рів.{c.ownerLevel}
        </p>
      </div>

      {/* brand stars */}
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={10} className={i < c.brandLevel ? "text-amber-400 fill-amber-400" : "text-gray-700"} />
        ))}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="rounded-lg bg-gray-900/60 px-2 py-1.5 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Капітал</p>
          <p className="text-xs font-mono font-semibold text-emerald-400">
            {formatNumber(Math.round(c.netWorth))}
            <span className="text-gray-600 ml-0.5 text-[9px]">GC</span>
          </p>
        </div>
        <div className="rounded-lg bg-gray-900/60 px-2 py-1.5 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Рейтинг</p>
          <p className={cn("text-xs font-mono font-bold", ratingTextColor(c.rating))}>{c.rating.toFixed(0)}</p>
        </div>
      </div>

      {/* rating bar */}
      <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", ratingBarColor(c.rating))}
          style={{ width: `${c.rating}%` }}
        />
      </div>

      <p className="text-[10px] text-gray-600">
        <Building2 size={9} className="inline mr-0.5" />
        {c.activeEnterprises} / {c.enterprises} підпр.
      </p>
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function TableRow({ c, index }: { c: CompanyRow; index: number }) {
  const medal = medalEmoji(c.rank);
  return (
    <tr
      className={cn(
        "transition-colors",
        c.isMyCompany
          ? "bg-blue-950/60 border-l-2 border-blue-500/30 hover:bg-blue-950/80"
          : index % 2 === 0
            ? "hover:bg-gray-800/30"
            : "bg-gray-900/30 hover:bg-gray-800/30",
      )}
    >
      {/* rank */}
      <td className="px-4 py-3 w-12">
        <div className="flex items-center justify-center">
          {medal ? (
            <span className="text-lg leading-none">{medal}</span>
          ) : (
            <span className="text-xs font-mono text-gray-500 w-5 text-center">{c.rank}</span>
          )}
        </div>
      </td>

      {/* company */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-sm shrink-0">🏢</div>
          <div className="min-w-0">
            <p className={cn("font-medium truncate text-sm", c.isMyCompany ? "text-blue-400" : "text-white")}>
              {c.name}
              {c.isMyCompany && <span className="ml-1.5 text-xs text-blue-500">(ви)</span>}
            </p>
            {c.slogan && <p className="text-[10px] text-gray-600 truncate italic">{c.slogan}</p>}
          </div>
        </div>
      </td>

      {/* owner */}
      <td className="px-4 py-3 hidden md:table-cell">
        <p className="text-gray-400 text-xs">{c.ownerUsername}</p>
        <p className="text-gray-600 text-[10px]">Рів. {c.ownerLevel}</p>
      </td>

      {/* enterprises */}
      <td className="px-4 py-3 text-right hidden sm:table-cell">
        <span className="font-mono text-white text-sm">{c.activeEnterprises}</span>
        <span className="text-gray-600 text-xs">/{c.enterprises}</span>
      </td>

      {/* capital */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-emerald-400 text-xs font-semibold">
          {formatNumber(Math.round(c.netWorth))}
        </span>
        <span className="text-gray-600 text-[10px] ml-0.5">GC</span>
      </td>

      {/* rating bar */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", ratingBarColor(c.rating))}
              style={{ width: `${c.rating}%` }}
            />
          </div>
          <span className={cn("text-xs font-mono font-semibold w-6 text-right shrink-0", ratingTextColor(c.rating))}>
            {c.rating.toFixed(0)}
          </span>
        </div>
      </td>

      {/* brand / owner level */}
      <td className="px-4 py-3 text-right hidden sm:table-cell">
        <div className="flex items-center justify-end gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={9} className={i < c.brandLevel ? "text-amber-400 fill-amber-400" : "text-gray-700"} />
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* podium skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-800 p-4 space-y-3 bg-gray-900/40">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
      {/* table skeletons */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-800/60">
            <Skeleton className="h-4 w-6 rounded" />
            <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20 hidden md:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RatingsClient() {
  const [rows,    setRows]    = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort,    setSort]    = useState<SortKey>("capital");
  const [search,  setSearch]  = useState("");
  const [myPosVisible, setMyPosVisible] = useState(false);

  // Ref map: rowId → DOM element for intersection observation
  const myRowRef  = useRef<HTMLTableRowElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/ratings")
      .then((r) => r.json())
      .then((data: CompanyRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sorted + filtered ──────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "capital")     copy.sort((a, b) => b.netWorth - a.netWorth);
    if (sort === "rating")      copy.sort((a, b) => b.rating - a.rating);
    if (sort === "enterprises") copy.sort((a, b) => b.activeEnterprises - a.activeEnterprises);
    return copy.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows, sort]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (r) => r.name.toLowerCase().includes(q) || r.ownerUsername.toLowerCase().includes(q),
    );
  }, [sorted, search]);

  const top3   = filtered.filter((r) => r.rank <= 3);
  const rest   = filtered.filter((r) => r.rank > 3);
  const myRow  = sorted.find((r) => r.isMyCompany);
  const myRank = myRow?.rank;

  // ── Sticky "Ваша позиція" — show when player's row scrolled out of view ──────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setMyPosVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Sticky "Ваша позиція" banner ─────────────────────────────────────── */}
      {myRank && myPosVisible && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="mt-2 px-4 py-2 bg-blue-950/95 border border-blue-500/40 rounded-xl shadow-xl text-sm text-blue-300 font-semibold backdrop-blur-sm pointer-events-auto">
            Ваша позиція: #{myRank}
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy size={22} className="text-amber-400" />
            Рейтинг компаній
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {loading ? "Завантаження..." : `${rows.length} компаній`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={loading}
          loading={loading}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Оновити
        </Button>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* sort toggles */}
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {SORT_META.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                sort === key ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300",
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        {/* search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Компанія або власник..."
            className="bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 w-52"
          />
        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────────── */}
      {loading && !rows.length && <LoadingSkeleton />}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-600">
          <Crown size={40} className="opacity-30" />
          <p className="text-lg font-medium">
            {search ? "Нічого не знайдено" : "Ще немає компаній"}
          </p>
          {search && (
            <button onClick={() => setSearch("")} className="text-sm text-gray-500 hover:text-gray-300 underline">
              Скинути пошук
            </button>
          )}
        </div>
      )}

      {/* ── Podium (top 3) ────────────────────────────────────────────────────── */}
      {!loading && top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* render order: 2nd, 1st, 3rd for visual podium effect on sm+ */}
          {[
            top3.find((c) => c.rank === 2),
            top3.find((c) => c.rank === 1),
            top3.find((c) => c.rank === 3),
          ]
            .filter(Boolean)
            .map((c) => (
              <PodiumCard key={c!.id} c={c!} />
            ))}
        </div>
      )}

      {/* sentinel to detect when myRow would appear */}
      {myRow && myRank && myRank > 3 && (
        <div
          ref={(el) => {
            // place sentinel just before the rest table
            sentinelRef.current = el;
          }}
        />
      )}

      {/* ── Rest of the table (rank 4+) ───────────────────────────────────────── */}
      {!loading && rest.length > 0 && (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/80 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider w-12">#</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Компанія</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider hidden md:table-cell">Власник</th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden sm:table-cell">Підприємства</th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider">Капітал</th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden lg:table-cell">Рейтинг</th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden sm:table-cell">Бренд</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {rest.map((c, idx) => (
                <tr
                  key={c.id}
                  ref={c.isMyCompany ? myRowRef : undefined}
                  // sentinel: insert invisible div before myRow if it is in top3+
                  className={cn(
                    "transition-colors",
                    c.isMyCompany
                      ? "bg-blue-950/60 border-l-2 border-blue-500/30 hover:bg-blue-950/80"
                      : idx % 2 === 0
                        ? "hover:bg-gray-800/30"
                        : "bg-gray-900/30 hover:bg-gray-800/30",
                  )}
                >
                  {/* rank */}
                  <td className="px-4 py-3 w-12">
                    <div className="flex items-center justify-center">
                      <span className="text-xs font-mono text-gray-500 w-5 text-center">{c.rank}</span>
                    </div>
                  </td>

                  {/* company */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-sm shrink-0">
                        🏢
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "font-medium truncate text-sm",
                            c.isMyCompany ? "text-blue-400" : "text-white",
                          )}
                        >
                          {c.name}
                          {c.isMyCompany && <span className="ml-1.5 text-xs text-blue-500">(ви)</span>}
                        </p>
                        {c.slogan && (
                          <p className="text-[10px] text-gray-600 truncate italic">{c.slogan}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* owner */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-gray-400 text-xs">{c.ownerUsername}</p>
                    <p className="text-gray-600 text-[10px]">Рів. {c.ownerLevel}</p>
                  </td>

                  {/* enterprises */}
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="font-mono text-white text-sm">{c.activeEnterprises}</span>
                    <span className="text-gray-600 text-xs">/{c.enterprises}</span>
                  </td>

                  {/* capital */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-emerald-400 text-xs font-semibold">
                      {formatNumber(Math.round(c.netWorth))}
                    </span>
                    <span className="text-gray-600 text-[10px] ml-0.5">GC</span>
                  </td>

                  {/* rating bar */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", ratingBarColor(c.rating))}
                          style={{ width: `${c.rating}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-mono font-semibold w-6 text-right shrink-0",
                          ratingTextColor(c.rating),
                        )}
                      >
                        {c.rating.toFixed(0)}
                      </span>
                    </div>
                  </td>

                  {/* brand stars */}
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <div className="flex items-center justify-end gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={9}
                          className={i < c.brandLevel ? "text-amber-400 fill-amber-400" : "text-gray-700"}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap gap-4 text-[11px] text-gray-600 border-t border-gray-800 pt-4">
          <span className="flex items-center gap-1">
            <TrendingUp size={10} className="text-emerald-400" />
            Капітал = чистий капітал (GC)
          </span>
          <span className="flex items-center gap-1">
            <Star size={10} className="text-amber-400 fill-amber-400" />
            Рейтинг — від 0 до 100
          </span>
          <span className="flex items-center gap-1">
            <Building2 size={10} className="text-blue-400" />
            Підприємства — активні / всього
          </span>
        </div>
      )}
    </div>
  );
}
