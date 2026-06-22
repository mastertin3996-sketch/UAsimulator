"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Coins, ChevronLeft, ChevronRight, Filter, Receipt, BarChart3 } from "lucide-react";
import TaxReceiptPanel from "@/components/game/TaxReceiptPanel";
import { RevenueChart, ProfitChart } from "@/components/game/charts/FinanceChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableHead, TableBody, TableRow,
  TableHeader, TableCell, TableEmpty,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyDisplay } from "@/components/game/CurrencyDisplay";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Txn {
  id: string; type: string; currency: string;
  amount: number; balanceAfter: number;
  description: string | null; createdAt: string;
  tickNumber: number | null;
}

interface CatRow { type: string; income: number; expense: number; net: number }

interface FinData {
  txns: Txn[];
  total: number; page: number; pages: number;
  stats: { totalIncome: number; totalExpenses: number; totalProfit: number };
  chartData: { tick: number; revenue: number; expenses: number; profit: number }[];
  byCategory: CatRow[];
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const TXN_LABELS: Record<string, { label: string; color: string; sign: 1 | -1 }> = {
  SALARY:          { label: "Зарплата",        color: "text-amber-400",   sign: -1 },
  RENT:            { label: "Оренда",          color: "text-orange-400",  sign: -1 },
  PRODUCTION:      { label: "Виробництво",     color: "text-blue-400",    sign: -1 },
  RETAIL_SALE:     { label: "Роздрібний продаж", color: "text-emerald-400", sign: 1 },
  MARKET_PURCHASE: { label: "Закупівля",       color: "text-red-400",     sign: -1 },
  MARKET_SALE:     { label: "Продаж (ринок)",  color: "text-green-400",   sign: 1  },
  RESEARCH:        { label: "Дослідження",     color: "text-violet-400",  sign: -1 },
  DEPOSIT:         { label: "Поповнення",      color: "text-emerald-400", sign: 1  },
  WITHDRAWAL:      { label: "Виведення",       color: "text-red-400",     sign: -1 },
  TRANSFER:        { label: "Трансфер",        color: "text-gray-400",    sign:  1 },
  CORPORATE_TAX:   { label: "Корп. податок",   color: "text-yellow-400",  sign: -1 },
  IMPORT_DUTY:     { label: "Митний збір",     color: "text-sky-400",     sign: -1 },
};

const ALL_TYPES = Object.keys(TXN_LABELS);

// ─── Category breakdown ───────────────────────────────────────────────────────

const CAT_GROUPS: { label: string; types: string[]; color: string }[] = [
  { label: "Продажі",    types: ["RETAIL_SALE", "MARKET_SALE", "CONTRACT_EXECUTED"], color: "#10b981" },
  { label: "Персонал",   types: ["SALARY"],                                          color: "#ef4444" },
  { label: "Операційні", types: ["RENT", "MAINTENANCE"],                             color: "#f59e0b" },
  { label: "Закупки",    types: ["MARKET_PURCHASE", "ENTERPRISE_PURCHASED"],         color: "#f97316" },
  { label: "Інше",       types: ["PRODUCTION", "DEPOSIT", "TRANSFER", "RESEARCH"],  color: "#8b5cf6" },
];

function CategoryBreakdown({ cats, totalIncome, totalExpenses }: {
  cats: CatRow[]; totalIncome: number; totalExpenses: number;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Income side */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm font-semibold text-emerald-400 mb-4">
          Дохід — {formatNumber(Math.round(totalIncome))} GC
        </p>
        <div className="space-y-3">
          {CAT_GROUPS.map((g) => {
            const inc = g.types.reduce((s, t) => s + (cats.find((c) => c.type === t)?.income ?? 0), 0);
            if (inc === 0) return null;
            const pct = totalIncome > 0 ? (inc / totalIncome) * 100 : 0;
            return (
              <div key={g.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">{g.label}</span>
                  <span className="font-mono text-white">{formatNumber(Math.round(inc))} GC <span className="text-gray-600">({pct.toFixed(0)}%)</span></span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expense side */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm font-semibold text-red-400 mb-4">
          Витрати — {formatNumber(Math.round(totalExpenses))} GC
        </p>
        <div className="space-y-3">
          {CAT_GROUPS.map((g) => {
            const exp = g.types.reduce((s, t) => s + (cats.find((c) => c.type === t)?.expense ?? 0), 0);
            if (exp === 0) return null;
            const pct = totalExpenses > 0 ? (exp / totalExpenses) * 100 : 0;
            return (
              <div key={g.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">{g.label}</span>
                  <span className="font-mono text-white">{formatNumber(Math.round(exp))} GC <span className="text-gray-600">({pct.toFixed(0)}%)</span></span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color, opacity: 0.8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-type detail table */}
      <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-sm font-semibold text-white">Деталі по типах транзакцій</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-gray-800">
              <th className="text-left px-4 py-2 font-normal">Тип</th>
              <th className="text-right px-4 py-2 font-normal">Дохід</th>
              <th className="text-right px-4 py-2 font-normal">Витрати</th>
              <th className="text-right px-4 py-2 font-normal">Нетто</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {cats.filter((c) => c.income > 0 || c.expense > 0).map((c) => {
              const lbl = TXN_LABELS[c.type]?.label ?? c.type;
              return (
                <tr key={c.type} className="hover:bg-gray-800/20">
                  <td className="px-4 py-2 text-gray-300">{lbl}</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-400">
                    {c.income > 0 ? `${formatNumber(Math.round(c.income))} GC` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-red-400">
                    {c.expense > 0 ? `${formatNumber(Math.round(c.expense))} GC` : "—"}
                  </td>
                  <td className={cn("px-4 py-2 text-right font-mono", c.net >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {c.net >= 0 ? "+" : ""}{formatNumber(Math.round(c.net))} GC
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stat cards ──────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, icon: Icon, iconColor, borderColor }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; iconColor: string; borderColor: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-gray-900 p-4", borderColor)}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center bg-gray-800")}>
          <Icon size={14} className={iconColor} />
        </div>
      </div>
      <p className={cn("text-2xl font-bold font-mono", iconColor)}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancesClient() {
  const [activeTab, setActiveTab] = useState<"transactions" | "categories" | "taxes">("transactions");
  const [data,     setData]     = useState<FinData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [typeFilter, setType]   = useState("");
  const [currFilter, setCurr]   = useState("");

  const load = useCallback(async (p: number, t: string, c: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p) });
      if (t) qs.set("type", t);
      if (c) qs.set("currency", c);
      const res = await fetch(`/api/finances?${qs}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, typeFilter, currFilter); }, [load, page, typeFilter, currFilter]);

  const applyFilter = (newType: string, newCurr: string) => {
    setType(newType);
    setCurr(newCurr);
    setPage(1);
  };

  // ── Skeleton ──
  if (loading && !data) return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  const d = data!;
  const profit = d.stats.totalProfit;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TrendingUp size={22} className="text-emerald-400" /> Фінансовий звіт
        </h1>
        <p className="text-gray-500 text-sm mt-1">Повна історія доходів, витрат, податків та митних зборів</p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 w-fit">
        {([
          { id: "transactions", label: "Транзакції",      icon: TrendingUp  },
          { id: "categories",   label: "Категорії",       icon: BarChart3   },
          { id: "taxes",        label: "Податки та мита", icon: Receipt     },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
              activeTab === id
                ? "bg-gray-700 text-white shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tax panel ── */}
      {activeTab === "taxes" && <TaxReceiptPanel />}

      {/* ── Categories breakdown ── */}
      {activeTab === "categories" && d.byCategory && (
        <CategoryBreakdown
          cats={d.byCategory}
          totalIncome={d.stats.totalIncome}
          totalExpenses={d.stats.totalExpenses}
        />
      )}

      {/* ── Transactions section ── */}
      {activeTab === "transactions" && <>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatBox
          label="Загальний дохід"
          value={`${formatNumber(d.stats.totalIncome)} GC`}
          icon={TrendingUp}
          iconColor="text-emerald-400"
          borderColor="border-emerald-900/50"
        />
        <StatBox
          label="Загальні витрати"
          value={`${formatNumber(d.stats.totalExpenses)} GC`}
          icon={TrendingDown}
          iconColor="text-red-400"
          borderColor="border-red-900/50"
        />
        <StatBox
          label="Чистий прибуток"
          value={`${profit >= 0 ? "+" : ""}${formatNumber(profit)} GC`}
          icon={Coins}
          iconColor={profit >= 0 ? "text-emerald-400" : "text-red-400"}
          borderColor={profit >= 0 ? "border-emerald-900/50" : "border-red-900/50"}
          sub="за весь час"
        />
      </div>

      {/* ── Charts ── */}
      {d.chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RevenueChart data={d.chartData} />
          <ProfitChart  data={d.chartData} />
        </div>
      )}

      {/* ── Transaction table ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Filter size={15} /> Транзакції
              <span className="text-gray-500 text-sm font-normal">({d.total})</span>
            </CardTitle>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={typeFilter}
                onChange={(e) => applyFilter(e.target.value, currFilter)}
                className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-500"
              >
                <option value="">Всі типи</option>
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>{TXN_LABELS[t]?.label ?? t}</option>
                ))}
              </select>
              <select
                value={currFilter}
                onChange={(e) => applyFilter(typeFilter, e.target.value)}
                className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-500"
              >
                <option value="">GC + PC</option>
                <option value="GAME_CASH">GC</option>
                <option value="PREMIUM_COIN">PC</option>
              </select>
              {(typeFilter || currFilter) && (
                <button
                  onClick={() => applyFilter("", "")}
                  className="text-xs text-gray-500 hover:text-white px-2 py-1.5 rounded-lg border border-gray-700 bg-gray-800 transition-colors"
                >
                  Скинути
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 px-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Тік</TableHeader>
                <TableHeader>Тип</TableHeader>
                <TableHeader>Опис</TableHeader>
                <TableHeader className="text-right">Сума</TableHeader>
                <TableHeader className="text-right">Баланс після</TableHeader>
                <TableHeader className="text-right">Дата</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : d.txns.length === 0 ? (
                <TableEmpty>Транзакцій не знайдено</TableEmpty>
              ) : (
                d.txns.map((t) => {
                  const cfg = TXN_LABELS[t.type] ?? { label: t.type, color: "text-gray-400", sign: 1 };
                  const isGC = t.currency !== "PREMIUM_COIN";
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        {t.tickNumber !== null
                          ? <span className="text-xs font-mono text-gray-500">#{t.tickNumber}</span>
                          : <span className="text-gray-700">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          <span className={cfg.color}>{cfg.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 max-w-xs truncate text-xs">
                        {t.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <CurrencyDisplay
                          amount={t.amount}
                          currency={isGC ? "GC" : "PC"}
                          showSign
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-gray-400">
                        {isGC ? `${formatNumber(t.balanceAfter)} GC` : `${Number(t.balanceAfter).toFixed(4)} PC`}
                      </TableCell>
                      <TableCell className="text-right text-gray-600 text-xs whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleString("uk-UA", {
                          day: "2-digit", month: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {d.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                Сторінка {d.page} з {d.pages} · {d.total} транзакцій
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={d.page <= 1}
                  className="p-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} className="text-gray-400" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(d.pages, p + 1))}
                  disabled={d.page >= d.pages}
                  className="p-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      </> /* end activeTab === "transactions" */}
    </div>
  );
}
