"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, ArrowUpRight,
  Landmark, Building, TrendingUp, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxConfig {
  corporateRate    : number;
  dutyRate         : number;
  corporateInterval: number;
}

interface CorpTaxData {
  lastTaxedTick        : number;
  ticksInPeriod        : number;
  ticksUntilNextTax    : number;
  balanceAtLastTax     : number;
  currentBalance       : number;
  netGrowthThisPeriod  : number;
  estimatedTax         : number;
  totalTaxPaid         : number;
  history: {
    id: string; amount: number; baseAmount: number;
    rate: number; tickNumber: number; description: string | null; createdAt: string;
  }[];
}

interface DutyData {
  totalDutyPaid: number;
  history: {
    id: string; amount: number; baseAmount: number;
    rate: number; tickNumber: number; description: string | null;
    cityId: string | null; createdAt: string;
  }[];
  byTick: Record<number, number>;
}

interface CityBudgetRow {
  cityId: string; cityName: string; population: number;
  wealthIndex: number; balance: number; totalCollected: number;
}

interface TaxResponse {
  config      : TaxConfig;
  corporateTax: CorpTaxData;
  importDuty  : DutyData;
  cityBudgets : CityBudgetRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gc(n: number, signed = false) {
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${Math.round(n).toLocaleString("uk")} GC`;
}

function pct(r: number) {
  return `${(r * 100).toFixed(0)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent?: "green" | "red" | "yellow" | "blue";
}) {
  const colors = {
    green : "from-emerald-500/10 border-emerald-500/30 text-emerald-400",
    red   : "from-red-500/10 border-red-500/30 text-red-400",
    yellow: "from-yellow-500/10 border-yellow-500/30 text-yellow-400",
    blue  : "from-blue-500/10 border-blue-500/30 text-blue-400",
  };
  const cls = colors[accent ?? "blue"];
  return (
    <div className={`bg-gradient-to-br ${cls} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <Icon size={20} className={cls.split(" ").pop()} />
        <div className="min-w-0">
          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
          <p className="text-lg font-bold text-white truncate">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = "emerald" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500", yellow: "bg-yellow-500",
    red: "bg-red-500", blue: "bg-blue-500",
  };
  return (
    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full ${colorMap[color] ?? "bg-emerald-500"} transition-all duration-500`}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}

// ─── Corporate Tax Panel ──────────────────────────────────────────────────────

function CorporateTaxPanel({ data, config }: { data: CorpTaxData; config: TaxConfig }) {
  const periodProgress   = config.corporateInterval - data.ticksUntilNextTax;
  const dangerLevel      = data.estimatedTax > data.currentBalance * 0.3 ? "red"
                         : data.estimatedTax > data.currentBalance * 0.15 ? "yellow"
                         : "green";

  return (
    <div className="space-y-6">
      {/* Current period */}
      <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock size={16} className="text-yellow-400" />
            Поточний податковий період
          </h3>
          <span className="text-xs text-gray-400">
            Кожні {config.corporateInterval} тіків · ставка {pct(config.corporateRate)}
          </span>
        </div>

        <div className="flex items-end gap-4 mb-3">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Прогрес тіків</p>
            <p className="text-2xl font-bold text-white">
              {periodProgress}
              <span className="text-sm text-gray-400"> / {config.corporateInterval}</span>
            </p>
          </div>
          <div className="flex-1 pb-2">
            <ProgressBar value={periodProgress} max={config.corporateInterval} color="yellow" />
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-0.5">До наступного</p>
            <p className="text-lg font-bold text-yellow-400">{data.ticksUntilNextTax} тік{data.ticksUntilNextTax === 1 ? "" : "ів"}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-700">
          <div>
            <p className="text-xs text-gray-400 mb-1">Баланс на старті</p>
            <p className="text-sm font-medium text-white">{gc(data.balanceAtLastTax)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Приріст за період</p>
            <p className={`text-sm font-medium ${data.netGrowthThisPeriod >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {gc(data.netGrowthThisPeriod, true)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Очікуваний податок</p>
            <p className={`text-sm font-bold ${dangerLevel === "red" ? "text-red-400" : dangerLevel === "yellow" ? "text-yellow-400" : "text-emerald-400"}`}>
              {gc(data.estimatedTax)}
            </p>
          </div>
        </div>

        {data.estimatedTax > 0 && (
          <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 text-xs ${
            dangerLevel === "red"    ? "bg-red-900/30 border border-red-700/40 text-red-300"
            : dangerLevel === "yellow" ? "bg-yellow-900/30 border border-yellow-700/40 text-yellow-300"
            : "bg-emerald-900/30 border border-emerald-700/40 text-emerald-300"
          }`}>
            {dangerLevel === "red" ? <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              : dangerLevel === "yellow" ? <Info size={14} className="mt-0.5 shrink-0" />
              : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
            <span>
              {dangerLevel === "red"
                ? `Увага! Очікуваний податок складає більше 30% поточного балансу. Підготуйте резерв ${gc(data.estimatedTax)}.`
                : dangerLevel === "yellow"
                ? `Через ${data.ticksUntilNextTax} тіків буде знято ${gc(data.estimatedTax)} корпоративного податку.`
                : `Бюджет у нормі. При наступному зборі буде знято орієнтовно ${gc(data.estimatedTax)}.`}
            </span>
          </div>
        )}
      </div>

      {/* History */}
      {data.history.length > 0 && (
        <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Історія нарахувань
          </h3>
          <div className="space-y-2">
            {data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                <div>
                  <p className="text-sm text-white">Тік #{h.tickNumber}</p>
                  <p className="text-xs text-gray-400">{h.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-red-400">−{gc(h.amount)}</p>
                  <p className="text-xs text-gray-500">з прибутку {gc(h.baseAmount)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between">
            <span className="text-xs text-gray-400">Сплачено всього</span>
            <span className="text-sm font-bold text-red-400">{gc(data.totalTaxPaid)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Import Duty Panel ────────────────────────────────────────────────────────

function ImportDutyPanel({ data, config }: { data: DutyData; config: TaxConfig }) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ArrowUpRight size={16} className="text-blue-400" />
            Мито на міжрегіональну торгівлю
          </h3>
          <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded-full">
            {pct(config.dutyRate)} від суми контракту
          </span>
        </div>

        <p className="text-xs text-gray-400 mb-5 leading-relaxed">
          При купівлі товарів через B2B-контракти між різними регіонами покупець сплачує
          додаткове мито. Ці кошти надходять до бюджету міста-отримувача і підвищують
          добробут його мешканців.
        </p>

        <div className="flex items-center justify-between py-3 border border-blue-700/30 rounded-lg px-4 bg-blue-900/10">
          <p className="text-sm text-gray-300">Всього сплачено мита</p>
          <p className="text-lg font-bold text-blue-400">{gc(data.totalDutyPaid)}</p>
        </div>
      </div>

      {data.history.length > 0 ? (
        <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Останні платежі</h3>
          <div className="space-y-2">
            {data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                <div>
                  <p className="text-sm text-white">{h.description ?? "Міжрегіональна поставка"}</p>
                  <p className="text-xs text-gray-400">Тік #{h.tickNumber} · Сума контракту {gc(h.baseAmount)}</p>
                </div>
                <p className="text-sm font-medium text-blue-400">−{gc(h.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-10 text-gray-500 text-sm">
          <ArrowUpRight size={32} className="mx-auto mb-2 opacity-30" />
          Ваші підприємства поки не торгують між різними регіонами
        </div>
      )}
    </div>
  );
}

// ─── City Budgets Panel ───────────────────────────────────────────────────────

function CityBudgetsPanel({ rows }: { rows: CityBudgetRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        <Landmark size={36} className="mx-auto mb-2 opacity-30" />
        Жодного міського бюджету ще не сформовано
      </div>
    );
  }

  const maxCollected = Math.max(...rows.map((r) => r.totalCollected), 1);

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-xs text-blue-300 leading-relaxed">
        <strong>Як це працює:</strong> Кожні {10} тіків {(0.10 * 100).toFixed(0)}% бюджету кожного міста
        інвестується у добробут жителів. Чим більший бюджет — тим швидше зростає{" "}
        <code className="bg-blue-900/40 px-1 rounded">wealthIndex</code>,
        який прямо підвищує попит NPC-покупців на всі товари.
      </div>

      <div className="bg-gray-800/60 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">Місто</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Населення</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Багатство</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Поточний бюджет</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-400">Всього зібрано</th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const wealthColor = r.wealthIndex >= 2.0 ? "text-emerald-400"
                                : r.wealthIndex >= 1.5 ? "text-yellow-400"
                                : r.wealthIndex >= 1.0 ? "text-gray-300"
                                : "text-red-400";
              return (
                <tr key={r.cityId} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20">
                  <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                    <Building size={14} className="text-gray-400 shrink-0" />
                    {r.cityName}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {(r.population / 1000).toFixed(0)}к
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${wealthColor}`}>
                    {r.wealthIndex.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {gc(r.balance)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {gc(r.totalCollected)}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar value={r.totalCollected} max={maxCollected} color="blue" />
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

// ─── Main component ───────────────────────────────────────────────────────────

type Tab = "corporate" | "duty" | "city";

export default function TaxReceiptPanel() {
  const [data,      setData]      = useState<TaxResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState(false);
  const [tab,       setTab]       = useState<Tab>("corporate");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/finances/taxes");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        Завантаження податкового звіту…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-40 text-red-400 text-sm">
        Помилка завантаження
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: "corporate", label: "Корп. податок",   badge: data.corporateTax.history.length > 0 ? String(data.corporateTax.history.length) : undefined },
    { id: "duty",      label: "Митні збори",      badge: data.importDuty.history.length   > 0 ? String(data.importDuty.history.length)   : undefined },
    { id: "city",      label: "Бюджети міст",     badge: data.cityBudgets.length          > 0 ? String(data.cityBudgets.length)           : undefined },
  ];

  return (
    <div>
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Ставка корп. податку"
          value={pct(data.config.corporateRate)}
          sub={`кожні ${data.config.corporateInterval} тіків`}
          icon={TrendingUp}
          accent="yellow"
        />
        <StatCard
          label="Очікуваний податок"
          value={gc(data.corporateTax.estimatedTax)}
          sub={`через ${data.corporateTax.ticksUntilNextTax} тік${data.corporateTax.ticksUntilNextTax === 1 ? "" : "ів"}`}
          icon={Clock}
          accent={data.corporateTax.estimatedTax > data.corporateTax.currentBalance * 0.3 ? "red" : "yellow"}
        />
        <StatCard
          label="Сплачено податків"
          value={gc(data.corporateTax.totalTaxPaid)}
          sub="за весь час"
          icon={Landmark}
          accent="blue"
        />
        <StatCard
          label="Сплачено мита"
          value={gc(data.importDuty.totalDutyPaid)}
          sub={`ставка ${pct(data.config.dutyRate)}`}
          icon={ArrowUpRight}
          accent="blue"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-800/50 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-md transition-colors ${
              tab === t.id
                ? "bg-gray-700 text-white shadow"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="bg-gray-600 text-gray-300 text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "corporate" && <CorporateTaxPanel data={data.corporateTax} config={data.config} />}
      {tab === "duty"      && <ImportDutyPanel   data={data.importDuty}   config={data.config} />}
      {tab === "city"      && <CityBudgetsPanel  rows={data.cityBudgets} />}
    </div>
  );
}

