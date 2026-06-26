"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, Building2, MapPin, Factory,
  Layers, Users, Zap, AlertCircle, ChevronRight, Loader2,
} from "lucide-react";
import { cn, formatUAH } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface City {
  id: string; name: string; nameUa: string; region: string;
  population: number; wageBaselineUah: number; energyTariffUah: number;
  demandCoefficient: number; availablePlots: number;
}

interface LandPlot {
  id: string; cadastralNumber: string; totalAreaM2: number;
  purchasePriceUah: number; monthlyLeaseCostUah: number;
  city: { id: string; nameUa: string; region: string };
}

interface MyPlot extends LandPlot { usedAreaM2: number; freeAreaM2: number; status: string }

interface Recipe {
  id: string; name: string;
  outputs: { quantityPerUnit: number; product: { nameUa: string; unit: string } }[];
  inputs:  { quantityPerUnit: number; product: { nameUa: string; unit: string } }[];
}

// ─── Enterprise metadata ──────────────────────────────────────────────────────

const ENT_TYPES = [
  { type: "OFFICE",           label: "Офіс",                icon: "🏢", cost: 50_000,  desc: "Потрібен для роботи в кожному місті" },
  { type: "AGRO_FARM",        label: "Агроферма",           icon: "🌾", cost: 200_000, desc: "Виробництво зернових, овочів, тваринництво" },
  { type: "FOOD_PROCESSING",  label: "Харчова переробка",   icon: "🏭", cost: 250_000, desc: "Млини, олійні, молокозаводи" },
  { type: "TEXTILE_FACTORY",  label: "Текстильна фабрика",  icon: "🧵", cost: 300_000, desc: "Вовна, тканини, одяг" },
  { type: "RETAIL_STORE",     label: "Роздрібний магазин",  icon: "🏪", cost: 100_000, desc: "Продаж товарів кінцевим споживачам" },
  { type: "WAREHOUSE",        label: "Склад",               icon: "📦", cost: 150_000, desc: "Зберігання та логістика" },
  { type: "LOGISTICS_HUB",    label: "Логістичний хаб",     icon: "🚛", cost: 200_000, desc: "Міжміські перевезення" },
  { type: "RD_LABORATORY",    label: "НД-Лабораторія",      icon: "🔬", cost: 400_000, desc: "Дослідження та технологічний розвиток" },
] as const;

type EntType = typeof ENT_TYPES[number]["type"];

const DEFAULT_FOOTPRINT: Record<string, number> = {
  OFFICE: 100, AGRO_FARM: 5000, FOOD_PROCESSING: 1500,
  TEXTILE_FACTORY: 2000, RETAIL_STORE: 200, WAREHOUSE: 3000,
  LOGISTICS_HUB: 4000, RD_LABORATORY: 500,
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ step, current, label }: { step: number; current: number; label: string }) {
  const done  = step < current;
  const active = step === current;
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
        done   ? "bg-emerald-600 text-white"
               : active ? "bg-emerald-500 text-white ring-2 ring-emerald-500/40"
               : "bg-gray-800 text-gray-500",
      )}>
        {done ? <Check size={12} /> : step}
      </div>
      <span className={cn("text-xs font-medium hidden sm:block", active ? "text-white" : done ? "text-emerald-400" : "text-gray-600")}>
        {label}
      </span>
    </div>
  );
}

// ─── Step 1: Choose City ─────────────────────────────────────────────────────

function StepCity({ onSelect }: { onSelect: (c: City) => void }) {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cities").then(r => r.json()).then(d => setCities(d.cities ?? [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Оберіть місто</h2>
        <p className="text-sm text-gray-500 mt-0.5">Підприємство буде відкрите у цьому місті</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cities.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-left hover:border-emerald-600/50 hover:bg-gray-800 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">{c.nameUa}</p>
                <p className="text-xs text-gray-500">{c.region}</p>
              </div>
              <ChevronRight size={14} className="text-gray-600 group-hover:text-emerald-400 transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {[
                { label: "Мін. зарплата", value: `${(c.wageBaselineUah / 1000).toFixed(0)}к ₴` },
                { label: "Тариф ел/е", value: `${c.energyTariffUah.toFixed(2)} ₴` },
                { label: "Попит NPC", value: `×${c.demandCoefficient.toFixed(1)}` },
                { label: "Вільні ділянки", value: c.availablePlots.toString(), color: c.availablePlots > 0 ? "text-emerald-400" : "text-red-400" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-[10px] text-gray-600">{label}</p>
                  <p className={cn("text-xs font-mono", color ?? "text-gray-300")}>{value}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Choose Land ──────────────────────────────────────────────────────

function StepLand({
  city, onSelect,
}: { city: City; onSelect: (plotId: string, action: "buy" | "lease") => void }) {
  const [plots, setPlots]   = useState<LandPlot[]>([]);
  const [mine,  setMine]    = useState<MyPlot[]>([]);
  const [loading, setLoad]  = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [err, setErr]       = useState("");

  useEffect(() => {
    fetch(`/api/land?cityId=${city.id}`)
      .then(r => r.json())
      .then(d => { setPlots(d.available ?? []); setMine(d.mine ?? []); })
      .finally(() => setLoad(false));
  }, [city.id]);

  const myInCity = mine.filter(m => m.city.id === city.id);

  async function handleAction(plotId: string, action: "buy" | "lease") {
    setBuying(plotId + action);
    setErr("");
    const res = await fetch("/api/land", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plotId, action }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setBuying(null); return; }
    onSelect(plotId, action);
  }

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Земельна ділянка у {city.nameUa}</h2>
        <p className="text-sm text-gray-500 mt-0.5">Оберіть вільну ділянку або використайте вже вашу</p>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {/* Existing plots in this city */}
      {myInCity.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Ваші ділянки у цьому місті</p>
          {myInCity.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id, p.status === "OWNED" ? "buy" : "lease")}
              className="w-full rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4 text-left hover:border-emerald-500/50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Кадастровий №{p.cadastralNumber}</p>
                  <p className="text-xs text-gray-500">{p.totalAreaM2.toLocaleString("uk")} м² · вільно {p.freeAreaM2.toLocaleString("uk")} м²</p>
                </div>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Вже ваша → Використати</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Available plots */}
      {plots.length === 0 && myInCity.length === 0 ? (
        <div className="py-12 text-center">
          <MapPin size={24} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Немає вільних ділянок у {city.nameUa}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plots.length > 0 && <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Вільні ділянки</p>}
          {plots.map(p => (
            <div key={p.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">Кадастровий №{p.cadastralNumber}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Площа: {p.totalAreaM2.toLocaleString("uk")} м²</p>
                  <div className="flex gap-4 mt-2">
                    <div>
                      <p className="text-[10px] text-gray-600">Ціна купівлі</p>
                      <p className="text-sm font-mono text-white">{formatUAH(p.purchasePriceUah)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-600">Оренда / міс</p>
                      <p className="text-sm font-mono text-gray-300">{formatUAH(p.monthlyLeaseCostUah)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    size="sm" variant="default"
                    disabled={!!buying}
                    onClick={() => handleAction(p.id, "buy")}
                  >
                    {buying === p.id + "buy" ? <Loader2 size={12} className="animate-spin" /> : "Купити"}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    disabled={!!buying}
                    onClick={() => handleAction(p.id, "lease")}
                  >
                    {buying === p.id + "lease" ? <Loader2 size={12} className="animate-spin" /> : "Орендувати"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Enterprise type ──────────────────────────────────────────────────

function StepType({
  onNext,
}: { onNext: (type: EntType, name: string, footprintM2: number) => void }) {
  const [selected, setSelected] = useState<EntType | null>(null);
  const [name, setName]         = useState("");
  const [size, setSize]         = useState(0);

  function handleSelect(t: EntType) {
    setSelected(t);
    setSize(DEFAULT_FOOTPRINT[t] ?? 500);
    const meta = ENT_TYPES.find(e => e.type === t);
    setName(meta?.label ?? "");
  }

  const meta = ENT_TYPES.find(e => e.type === selected);
  const canProceed = !!selected && name.trim().length >= 2;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Тип підприємства</h2>
        <p className="text-sm text-gray-500 mt-0.5">Оберіть галузь та назвіть вашу компанію</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {ENT_TYPES.map(e => (
          <button
            key={e.type}
            onClick={() => handleSelect(e.type)}
            className={cn(
              "rounded-xl border p-3 text-left transition-all",
              selected === e.type
                ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : "border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800",
            )}
          >
            <span className="text-2xl mb-2 block">{e.icon}</span>
            <p className="text-xs font-semibold text-white leading-tight">{e.label}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{e.desc}</p>
            <p className="text-[10px] font-mono text-emerald-400 mt-2">{formatUAH(e.cost)}</p>
          </button>
        ))}
      </div>

      {selected && meta && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">{meta.icon} {meta.label}</h3>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Назва підприємства</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={64}
              placeholder={`Наприклад: ${meta.label} "Схід"`}
              className="w-full rounded-lg border border-gray-800 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Площа забудови (м²)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={50} max={(DEFAULT_FOOTPRINT[selected] ?? 500) * 2} step={50}
                value={size}
                onChange={e => setSize(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="text-sm font-mono text-white w-20 text-right">{size.toLocaleString("uk")} м²</span>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!canProceed}
            onClick={() => canProceed && onNext(selected, name.trim(), size)}
          >
            Далі <ArrowRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Confirm & Build ──────────────────────────────────────────────────

function StepConfirm({
  city, plotId, plotAction, type, name, footprintM2,
  onDone,
}: {
  city: City; plotId: string; plotAction: string;
  type: EntType; name: string; footprintM2: number;
  onDone: (id: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  const [err, setErr]           = useState("");
  const [balance, setBalance]   = useState<number | null>(null);

  const meta = ENT_TYPES.find(e => e.type === type)!;

  useEffect(() => {
    fetch("/api/wallet").then(r => r.json()).then(d => setBalance(d.balance ?? null));
  }, []);

  async function handleBuild() {
    setBuilding(true); setErr("");
    const res = await fetch("/api/enterprises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landPlotId: plotId, type, name, footprintM2, totalFloorAreaM2: footprintM2 * 1.5 }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setBuilding(false); return; }
    onDone(data.enterprise?.id ?? "");
  }

  const costAfter = balance !== null ? balance - meta.cost : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Підтвердити будівництво</h2>
        <p className="text-sm text-gray-500 mt-0.5">Перевірте дані та натисніть «Збудувати»</p>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        {[
          { icon: <MapPin size={14} />, label: "Місто", value: city.nameUa },
          { icon: <Layers size={14} />, label: "Ділянка", value: `${plotAction === "buy" ? "Куплена" : "Орендована"}` },
          { icon: <Factory size={14} />, label: "Тип", value: `${meta.icon} ${meta.label}` },
          { icon: <Building2 size={14} />, label: "Назва", value: name },
          { icon: <Layers size={14} />, label: "Площа", value: `${footprintM2.toLocaleString("uk")} м²` },
        ].map(({ icon, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-gray-500 shrink-0">{icon}</span>
            <span className="text-xs text-gray-500 w-24">{label}</span>
            <span className="text-sm text-white font-medium">{value}</span>
          </div>
        ))}

        <div className="pt-3 border-t border-gray-800 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Вартість будівництва</span>
            <span className="font-mono text-orange-400">{formatUAH(meta.cost)}</span>
          </div>
          {balance !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Залишок після</span>
              <span className={cn("font-mono font-semibold", (costAfter ?? 0) < 0 ? "text-red-400" : "text-white")}>
                {costAfter !== null ? formatUAH(costAfter) : "—"}
              </span>
            </div>
          )}
        </div>
      </div>

      {costAfter !== null && costAfter < 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={14} /> Недостатньо коштів
        </div>
      )}

      <Button
        className="w-full"
        disabled={building || (costAfter !== null && costAfter < 0)}
        onClick={handleBuild}
      >
        {building ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
        {building ? "Будуємо…" : "Збудувати"}
      </Button>
    </div>
  );
}

// ─── Step 5: Success ──────────────────────────────────────────────────────────

function StepSuccess({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <div className="py-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
        <Check size={28} className="text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-white">Підприємство збудовано!</h2>
      <p className="text-gray-500 text-sm">«{name}» готове до роботи</p>
      <div className="flex gap-3 justify-center pt-2">
        <Button variant="outline" onClick={() => router.push("/enterprises")}>
          До списку
        </Button>
        <Button onClick={() => router.push(`/enterprises/${id}?tab=workshops`)}>
          Налаштувати виробництво <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function CreateEnterprisePage() {
  const router  = useRouter();
  const [step,  setStep]  = useState(1);
  const [city,  setCity]  = useState<City | null>(null);
  const [plotId, setPlotId] = useState("");
  const [plotAction, setPlotAction] = useState<"buy" | "lease">("lease");
  const [entType, setEntType]   = useState<EntType | null>(null);
  const [entName, setEntName]   = useState("");
  const [footprint, setFootprint] = useState(500);
  const [doneId, setDoneId]     = useState("");
  const [doneName, setDoneName] = useState("");

  // Pre-fill from land page: skip steps 1 & 2
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid    = params.get("plotId");
    const action = params.get("action") as "buy" | "lease" | null;
    if (!pid) return;
    fetch(`/api/land?plotId=${pid}`)
      .then(r => r.json())
      .then(d => {
        const plot: { cityId: string; cityName: string; cityNameUa?: string; region?: string } = d.plot;
        if (!plot) return;
        setPlotId(pid);
        setPlotAction(action ?? "lease");
        setCity({ id: plot.cityId, name: plot.cityName, nameUa: plot.cityNameUa ?? plot.cityName, region: plot.region ?? "", population: 0, wageBaselineUah: 0, energyTariffUah: 0, demandCoefficient: 1, availablePlots: 0 });
        setStep(3);
      })
      .catch(() => {});
  }, []);

  const STEPS = [
    { n: 1, label: "Місто" },
    { n: 2, label: "Земля" },
    { n: 3, label: "Тип" },
    { n: 4, label: "Підтвердити" },
  ];

  const handleCitySelect = (c: City) => { setCity(c); setStep(2); };
  const handleLandSelect = (pid: string, action: "buy" | "lease") => {
    setPlotId(pid); setPlotAction(action); setStep(3);
  };
  const handleTypeNext = useCallback((t: EntType, n: string, fp: number) => {
    setEntType(t); setEntName(n); setFootprint(fp); setStep(4);
  }, []);
  const handleDone = (id: string) => {
    setDoneId(id); setDoneName(entName); setStep(5);
  };

  if (step === 5) return <StepSuccess id={doneId} name={doneName} />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => step > 1 ? setStep(s => s - 1) : router.push("/enterprises")}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl font-bold text-white">Нове підприємство</h1>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <StepDot step={s.n} current={step} label={s.label} />
            {i < STEPS.length - 1 && <div className={cn("h-px flex-1 w-8", step > s.n ? "bg-emerald-600" : "bg-gray-800")} />}
          </div>
        ))}
      </div>

      {/* Content */}
      <div>
        {step === 1 && <StepCity onSelect={handleCitySelect} />}
        {step === 2 && city && <StepLand city={city} onSelect={handleLandSelect} />}
        {step === 3 && <StepType onNext={handleTypeNext} />}
        {step === 4 && city && entType && (
          <StepConfirm
            city={city} plotId={plotId} plotAction={plotAction}
            type={entType} name={entName} footprintM2={footprint}
            onDone={handleDone}
          />
        )}
      </div>

      {/* Quick stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-600 border-t border-gray-800 pt-4">
        {city && <span className="flex items-center gap-1"><MapPin size={10} /> {city.nameUa}</span>}
        {plotAction && plotId && <span className="flex items-center gap-1"><Layers size={10} /> Ділянка {plotAction === "buy" ? "куплена" : "орендована"}</span>}
        {entType && <span className="flex items-center gap-1"><Factory size={10} /> {ENT_TYPES.find(e => e.type === entType)?.label}</span>}
        {entName && <span className="flex items-center gap-1"><Building2 size={10} /> {entName}</span>}
      </div>
    </div>
  );
}
