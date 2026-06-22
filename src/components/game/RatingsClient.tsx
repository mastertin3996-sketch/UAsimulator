"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Trophy, Star, Building2, TrendingUp, Crown, Medal,
  Search, RefreshCw, Wallet, Factory, Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow {
  rank: number; id: string; name: string; slogan: string | null;
  rating: number; brandLevel: number; totalAssets: number; gameCash: number; netWorth: number;
  ownerUsername: string; ownerLevel: number; isMyCompany: boolean;
  enterprises: number; activeEnterprises: number;
  createdAt: string;
}

interface SectorLeader {
  companyId  : string;
  companyName: string;
  count      : number;
  revenue    : number;
  isMe       : boolean;
}

interface RatingsData {
  myCompanyId   : string | null;
  companies     : CompanyRow[];
  byWealth      : CompanyRow[];
  byEnterprises : CompanyRow[];
  myRanks       : { rating: number; wealth: number; enterprises: number } | null;
  nearby        : CompanyRow[];
  sectorLeaders : { category: string; topCompanies: SectorLeader[] }[];
  totalCompanies: number;
  lastTickNumber: number | null;
}

type Tab = "rating" | "wealth" | "enterprises" | "sectors";

const TAB_META: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: "rating",      label: "Рейтинг",      Icon: Star      },
  { key: "wealth",      label: "Капіталізація", Icon: Wallet    },
  { key: "enterprises", label: "Підприємства",  Icon: Building2 },
  { key: "sectors",     label: "По секторах",   Icon: Factory   },
];

const SECTOR_META: Record<string, { label: string; color: string; emoji: string }> = {
  EXTRACTION: { label: "Видобуток",   color: "text-amber-400",  emoji: "⛏️"  },
  PRODUCTION: { label: "Виробництво", color: "text-blue-400",   emoji: "🏭"  },
  TRADE     : { label: "Торгівля",    color: "text-emerald-400",emoji: "🏪"  },
  LOGISTICS : { label: "Логістика",   color: "text-violet-400", emoji: "🚚"  },
};

// ─── Rank icon ────────────────────────────────────────────────────────────────

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={16} className="text-amber-400" />;
  if (rank === 2) return <Medal size={14} className="text-gray-300" />;
  if (rank === 3) return <Medal size={14} className="text-amber-600" />;
  return <span className="text-xs font-mono text-gray-500 w-5 text-center inline-block">{rank}</span>;
}

// ─── Leaderboard table ────────────────────────────────────────────────────────

type ColKey = "rating" | "wealth" | "enterprises";

function LeaderTable({
  rows, valueCol, search,
}: {
  rows     : CompanyRow[];
  valueCol : ColKey;
  search   : string;
}) {
  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.ownerUsername.toLowerCase().includes(q));
  }, [rows, search]);

  const VALUE_CFG: Record<ColKey, { header: string; render: (r: CompanyRow) => React.ReactNode }> = {
    rating: {
      header: "Рейтинг",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Star size={10} className="text-amber-400" />
          <span className="font-mono font-semibold text-amber-400">{r.rating.toFixed(0)}</span>
        </div>
      ),
    },
    wealth: {
      header: "Капіталізація",
      render: (r) => (
        <div>
          <span className="font-mono text-emerald-400 font-semibold">{formatNumber(Math.round(r.netWorth))}</span>
          <span className="text-[10px] text-gray-600 ml-1">GC</span>
        </div>
      ),
    },
    enterprises: {
      header: "Підприємства",
      render: (r) => (
        <span className="font-mono text-white">{r.activeEnterprises}<span className="text-gray-600">/{r.enterprises}</span></span>
      ),
    },
  };

  const cfg = VALUE_CFG[valueCol];

  if (filtered.length === 0) {
    return <div className="text-center py-10 text-gray-600 text-sm">Нічого не знайдено</div>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-900/80 border-b border-gray-800">
        <tr>
          <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider w-10">#</th>
          <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Компанія</th>
          <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider">{cfg.header}</th>
          <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden sm:table-cell">Бренд</th>
          <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider hidden md:table-cell">Гравець</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800/60">
        {filtered.map((c) => (
          <tr
            key={c.id}
            className={cn(
              "transition-colors",
              c.isMyCompany ? "bg-violet-950/20 hover:bg-violet-950/30" : "hover:bg-gray-800/30",
            )}
          >
            <td className="px-4 py-3">
              <div className="flex items-center justify-center">
                <RankIcon rank={c.rank} />
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-sm shrink-0">🏢</div>
                <div className="min-w-0">
                  <p className={cn("font-medium truncate text-sm", c.isMyCompany ? "text-violet-400" : "text-white")}>
                    {c.name}
                    {c.isMyCompany && <span className="ml-1.5 text-xs text-violet-500">(ви)</span>}
                  </p>
                  {c.slogan && <p className="text-[10px] text-gray-600 truncate italic">{c.slogan}</p>}
                </div>
              </div>
            </td>
            <td className="px-4 py-3 text-right">{cfg.render(c)}</td>
            <td className="px-4 py-3 text-right hidden sm:table-cell">
              <div className="flex items-center justify-end gap-0.5">
                {Array.from({ length: Math.min(5, c.brandLevel) }).map((_, i) => (
                  <Star key={i} size={9} className="text-amber-400 fill-amber-400" />
                ))}
                {Array.from({ length: Math.max(0, 5 - c.brandLevel) }).map((_, i) => (
                  <Star key={i} size={9} className="text-gray-700" />
                ))}
              </div>
            </td>
            <td className="px-4 py-3 text-right hidden md:table-cell">
              <p className="text-gray-400 text-xs">{c.ownerUsername}</p>
              <p className="text-gray-600 text-[10px]">Рів. {c.ownerLevel}</p>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Sector leaders ───────────────────────────────────────────────────────────

function SectorsTab({ sectors }: { sectors: RatingsData["sectorLeaders"] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {sectors.map(({ category, topCompanies }) => {
        const meta = SECTOR_META[category] ?? { label: category, color: "text-gray-400", emoji: "🏭" };
        const maxCount = topCompanies[0]?.count ?? 1;
        return (
          <div key={category} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{meta.emoji}</span>
              <h3 className={cn("font-semibold text-sm", meta.color)}>{meta.label}</h3>
            </div>
            {topCompanies.length === 0 ? (
              <p className="text-gray-600 text-xs py-2">Немає компаній у цьому секторі</p>
            ) : (
              <div className="space-y-2">
                {topCompanies.map((c, i) => (
                  <div key={c.companyId} className={cn("space-y-1", c.isMe ? "opacity-100" : "")}>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-gray-600 w-4 shrink-0">#{i + 1}</span>
                        <span className={cn("font-medium truncate", c.isMe ? "text-violet-400" : "text-white")}>
                          {c.companyName}
                          {c.isMe && <span className="text-violet-500 ml-1 text-[10px]">(ви)</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-gray-400"><Building2 size={10} className="inline mr-0.5" />{c.count}</span>
                        {c.revenue > 0 && (
                          <span className="font-mono text-emerald-400 text-[10px]">+{formatNumber(Math.round(c.revenue))} GC</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", meta.color.replace("text-", "bg-").replace("400", "500"))}
                        style={{ width: `${(c.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── My position panel ───────────────────────────────────────────────────────

function MyPositionPanel({ data }: { data: RatingsData }) {
  const myRow = data.companies.find((c) => c.isMyCompany)
    ?? data.byWealth.find((c) => c.isMyCompany)
    ?? data.nearby.find((c) => c.isMyCompany);

  if (!myRow || !data.myRanks) return null;

  const positions = [
    { label: "Рейтинг",      rank: data.myRanks.rating,      icon: Star,      color: "text-amber-400", value: myRow.rating.toFixed(0) + " ★" },
    { label: "Капіталізація", rank: data.myRanks.wealth,      icon: Wallet,    color: "text-emerald-400", value: formatNumber(Math.round(myRow.netWorth)) + " GC" },
    { label: "Підприємства",  rank: data.myRanks.enterprises, icon: Building2, color: "text-blue-400", value: myRow.activeEnterprises + " акт." },
  ];

  return (
    <div className="rounded-xl border border-violet-700/50 bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-violet-400" />
        <p className="text-sm font-semibold text-white">Ваша позиція — <span className="text-violet-400">{myRow.name}</span></p>
        <span className="text-xs text-gray-500 ml-auto">з {data.totalCompanies} компаній</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {positions.map(({ label, rank, icon: Icon, color, value }) => (
          <div key={label} className="rounded-lg bg-gray-900/60 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Icon size={10} className={color} />
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-lg font-bold text-white">#{rank}</p>
            <p className={cn("text-[10px] font-mono", color)}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Nearby panel ────────────────────────────────────────────────────────────

function NearbyPanel({ nearby }: { nearby: CompanyRow[] }) {
  if (nearby.length <= 1) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Сусіди в рейтингу</p>
      <div className="space-y-1">
        {nearby.map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex items-center justify-between px-3 py-1.5 rounded-lg text-xs",
              c.isMyCompany ? "bg-violet-900/30 border border-violet-700/40" : "hover:bg-gray-800/40",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-600 w-6 shrink-0 text-center">#{c.rank}</span>
              <span className={cn("font-medium truncate", c.isMyCompany ? "text-violet-400" : "text-white")}>
                {c.name}
                {c.isMyCompany && <span className="text-violet-500 ml-1">(ви)</span>}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Star size={9} className="text-amber-400" />
              <span className="font-mono text-amber-400">{c.rating.toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RatingsClient() {
  const [data,    setData]    = useState<RatingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>("rating");
  const [search,  setSearch]  = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/ratings")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const tableRows = data
    ? tab === "rating"      ? data.companies
    : tab === "wealth"      ? data.byWealth
    : tab === "enterprises" ? data.byEnterprises
    : []
    : [];

  const tableCol: ColKey =
    tab === "wealth"      ? "wealth"
    : tab === "enterprises" ? "enterprises"
    : "rating";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy size={22} className="text-amber-400" /> Рейтинги компаній
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {data
              ? `${data.totalCompanies} компаній · ${data.lastTickNumber ? `тік #${data.lastTickNumber}` : "тіків ще немає"}`
              : "Завантаження..."}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Оновити
        </button>
      </div>

      {/* My position */}
      {!loading && data && <MyPositionPanel data={data} />}

      {/* Nearby */}
      {!loading && data && data.nearby.length > 1 && tab === "rating" && (
        <NearbyPanel nearby={data.nearby} />
      )}

      {/* Tabs + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 border-b border-gray-800 flex-1">
          {TAB_META.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap",
                tab === key
                  ? "text-white border-amber-500"
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600",
              )}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        {tab !== "sectors" && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук..."
              className="bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 w-36"
            />
          </div>
        )}
      </div>

      {/* Content */}
      {loading && !data ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-500">Помилка завантаження</div>
      ) : tab === "sectors" ? (
        <SectorsTab sectors={data.sectorLeaders} />
      ) : (
        <Card>
          <CardContent className="pt-0 px-0">
            <LeaderTable rows={tableRows} valueCol={tableCol} search={search} />
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {!loading && data && tab !== "sectors" && (
        <div className="flex gap-4 text-[11px] text-gray-600 border-t border-gray-800 pt-4">
          <span className="flex items-center gap-1"><TrendingUp size={10} className="text-emerald-400" /> Капіталізація = активи + готівка GC</span>
          <span className="flex items-center gap-1"><Star size={10} className="text-amber-400 fill-amber-400" /> Рейтинг = репутаційний бал компанії</span>
        </div>
      )}
    </div>
  );
}
