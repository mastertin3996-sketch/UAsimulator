"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, XCircle, Loader2, RefreshCw, AlertCircle, Coins } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface Program {
  id: string; type: string; description: string;
  subsidyPercentage: number; availableFundsUah: number;
  isActive: boolean; eligibleTypes: string[];
}
interface Enterprise { id: string; name: string; type: string; }
interface Application { enterpriseId: string; subsidyType: string; amountUah: number; appliedAtTick: number; }

interface Data {
  currentTick: number; complianceScore: number; complianceOk: boolean;
  enterprises: Enterprise[]; programs: Program[];
  applications: Application[]; appliedSet: string[];
}

const PROGRAM_LABEL: Record<string, string> = {
  AGRO_DEVELOPMENT:  "Аграрний фонд",
  GREEN_TRANSITION:  "Зелений перехід",
  REGIONAL_STIMULUS: "Регіональний грант",
};
const PROGRAM_COLOR: Record<string, { border: string; bg: string; badge: string; icon: string }> = {
  AGRO_DEVELOPMENT:  { border: "border-emerald-800/50", bg: "bg-emerald-950/20", badge: "bg-emerald-900/60 text-emerald-300", icon: "🌾" },
  GREEN_TRANSITION:  { border: "border-teal-800/50",    bg: "bg-teal-950/20",    badge: "bg-teal-900/60 text-teal-300",       icon: "♻️" },
  REGIONAL_STIMULUS: { border: "border-blue-800/50",    bg: "bg-blue-950/20",    badge: "bg-blue-900/60 text-blue-300",        icon: "🏗️" },
};

const TYPE_UA: Record<string, string> = {
  AGRO_FARM:       "Агрофермa",
  FOOD_PROCESSING: "Харчпереробка",
  TEXTILE_FACTORY: "Текстиль",
  WAREHOUSE:       "Склад",
  LOGISTICS_HUB:   "Логістика",
};

export default function SubsidiesPage() {
  const [data,      setData]      = useState<Data | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [applying,  setApplying]  = useState<string | null>(null);
  const [msg,       setMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [selected,  setSelected]  = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/subsidies");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function apply(programType: string) {
    const enterpriseId = selected[programType];
    if (!enterpriseId) return;
    setApplying(programType);
    setMsg(null);
    const res = await fetch("/api/subsidies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId, programType }),
    });
    const d = await res.json();
    if (res.ok) {
      setMsg({ ok: true, text: `Субсидія ₴${formatNumber(Math.round(d.subsidyAmountUah))} зарахована!` });
      await load();
    } else {
      setMsg({ ok: false, text: d.error ?? "Помилка" });
    }
    setApplying(null);
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-xl bg-gray-800 animate-pulse" />)}
    </div>
  );

  if (!data) return <p className="text-red-400 p-8">Помилка завантаження</p>;

  const { complianceScore, complianceOk, enterprises, programs, applications, appliedSet } = data;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Coins size={22} className="text-emerald-400" /> Державні субсидії
        </h1>
        <p className="text-gray-500 text-sm mt-1">Отримайте cashback на капітальні витрати від держпрограм підтримки бізнесу</p>
      </div>

      {/* Compliance status */}
      <div className={cn(
        "rounded-xl border px-4 py-3 flex items-center gap-3",
        complianceOk ? "border-emerald-900/40 bg-emerald-950/10" : "border-red-900/40 bg-red-950/10",
      )}>
        {complianceOk
          ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          : <XCircle size={16} className="text-red-400 shrink-0" />}
        <div>
          <p className={cn("text-sm font-semibold", complianceOk ? "text-emerald-300" : "text-red-300")}>
            {complianceOk ? "Компанія відповідає вимогам" : "Не відповідає вимогам (мінімум 90%)"}
          </p>
          <p className="text-xs text-gray-500">Рівень комплаєнсу: {(complianceScore * 100).toFixed(1)}% · Поріг: 90%</p>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={cn("rounded-xl px-4 py-3 flex items-center gap-2 text-sm",
          msg.ok ? "bg-emerald-950/30 text-emerald-300 border border-emerald-900/40"
                 : "bg-red-950/30 text-red-300 border border-red-900/40")}>
          {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {/* Programs */}
      <div className="space-y-4">
        {programs.map(prog => {
          const cfg    = PROGRAM_COLOR[prog.type] ?? PROGRAM_COLOR.REGIONAL_STIMULUS;
          const label  = PROGRAM_LABEL[prog.type] ?? prog.type;
          const appFor = appliedSet.filter(k => k.endsWith(`:${prog.type}`));
          const eligEnterprises = prog.eligibleTypes.length === 0
            ? enterprises
            : enterprises.filter(e => prog.eligibleTypes.includes(e.type));
          const exhausted = prog.availableFundsUah < 1;

          return (
            <div key={prog.type} className={cn("rounded-xl border p-5 space-y-4", cfg.border, cfg.bg)}>
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className="text-sm font-bold text-white">{label}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", cfg.badge)}>
                      +{Math.round(prog.subsidyPercentage * 100)}% cashback
                    </span>
                    {exhausted && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                        Вичерпано
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{prog.description}</p>
                </div>
              </div>

              {/* Budget bar */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>Залишок фонду</span>
                  <span>₴{formatNumber(Math.round(prog.availableFundsUah))}</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, prog.availableFundsUah / 500_000)}%` }} />
                </div>
              </div>

              {/* Eligible types */}
              {prog.eligibleTypes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-gray-600">Для:</span>
                  {prog.eligibleTypes.map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                      {TYPE_UA[t] ?? t}
                    </span>
                  ))}
                </div>
              )}

              {/* Already received applications */}
              {appFor.length > 0 && (
                <div className="space-y-1">
                  {applications.filter(a => a.subsidyType === prog.type).map(a => (
                    <div key={a.enterpriseId} className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 size={12} />
                      <span className="text-gray-400">
                        {enterprises.find(e => e.id === a.enterpriseId)?.name ?? a.enterpriseId}
                      </span>
                      <span>— ₴{formatNumber(Math.round(a.amountUah))} (тік #{a.appliedAtTick})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Apply form */}
              {complianceOk && !exhausted && (
                <div className="flex gap-2 items-center">
                  <select
                    value={selected[prog.type] ?? ""}
                    onChange={e => setSelected(prev => ({ ...prev, [prog.type]: e.target.value }))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">Оберіть підприємство</option>
                    {eligEnterprises.map(e => {
                      const already = appliedSet.includes(`${e.id}:${prog.type}`);
                      return (
                        <option key={e.id} value={e.id} disabled={already}>
                          {e.name} ({TYPE_UA[e.type] ?? e.type}){already ? " — отримано" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    onClick={() => apply(prog.type)}
                    disabled={!selected[prog.type] || !!applying}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors shrink-0"
                  >
                    {applying === prog.type ? <Loader2 size={13} className="animate-spin" /> : <Building2 size={13} />}
                    Подати
                  </button>
                </div>
              )}

              {eligEnterprises.length === 0 && (
                <p className="text-xs text-gray-600">Немає операційних підприємств потрібного типу.</p>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={load} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors mx-auto pt-2">
        <RefreshCw size={10} /> Оновити
      </button>
    </div>
  );
}
