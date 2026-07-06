"use client";

import { useEffect, useState } from "react";
import {
  Factory, Wrench, Hammer, Cpu, Plus, BookOpen, SlidersHorizontal, Loader2, X,
} from "lucide-react";
import { cn, formatUAH } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  SKU_EMOJI, RECIPE_UA, RecipeModal, productEmoji,
  AGRO_SEASON_MULTS_UI, ROTATION_NEXT_UI, FIELD_CROPS_UI,
} from "@/components/game/EnterpriseDetailClient";
import type { EnterpriseData, AgroInfo, Workshop, EquipCatalogItem } from "@/components/game/EnterpriseDetailClient";

const STATUS_COLOR: Record<string, string> = {
  NEW: "text-blue-400", OPERATIONAL: "text-emerald-400",
  WORN: "text-amber-400", BROKEN: "text-red-400",
};

const STATUS_UA: Record<string, string> = {
  NEW: "Нове", OPERATIONAL: "Робоче", WORN: "Зношене", BROKEN: "Зламане",
};

function WearBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", pct < 30 ? "bg-emerald-500" : pct < 80 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function AddWorkshopModal({
  enterprise, onAdded, onClose,
}: { enterprise: EnterpriseData; onAdded: () => void; onClose: () => void }) {
  const [name, setName]         = useState("Цех 1");
  const [footprint, setFootprint] = useState(200);
  const [capacity, setCapacity] = useState(100);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const freeArea = enterprise.totalFloorAreaM2 - enterprise.usedFloorAreaM2;

  async function save() {
    setSaving(true); setErr("");
    const res = await fetch(`/api/enterprises/${enterprise.id}/workshop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), footprintM2: footprint, maxCapacity: capacity }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setSaving(false); return; }
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Додати цех</h3>
          <button onClick={onClose} aria-label="Закрити" className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Назва цеху</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white mt-1 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Площа (м²)</label>
              <span className="text-xs font-mono text-white">{footprint} м² <span className="text-gray-600">/ {freeArea.toFixed(0)} вільно</span></span>
            </div>
            <input type="range" min={50} max={Math.max(50, freeArea)} step={10}
              value={footprint} onChange={e => setFootprint(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Макс. потужність (од/тік)</label>
              <span className="text-xs font-mono text-white">{capacity}</span>
            </div>
            <input type="range" min={10} max={1000} step={10}
              value={capacity} onChange={e => setCapacity(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={save} disabled={saving || footprint > freeArea}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Додати
          </Button>
        </div>
      </div>
    </div>
  );
}

function BuyEquipmentModal({
  workshopId, workshopName, onBought, onClose,
}: { workshopId: string; workshopName: string; onBought: () => void; onClose: () => void }) {
  const [catalog,  setCatalog]  = useState<EquipCatalogItem[]>([]);
  const [freeM2,   setFreeM2]   = useState(0);
  const [selected, setSelected] = useState<EquipCatalogItem | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    fetch(`/api/workshops/${workshopId}/equipment`)
      .then((r) => r.json())
      .then((d) => { setCatalog(d.catalog ?? []); setFreeM2(d.freeM2 ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [workshopId]);

  async function buy() {
    if (!selected) return;
    setSaving(true); setErr("");
    const res = await fetch(`/api/workshops/${workshopId}/equipment`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ productId: selected.id, priceUah: selected.basePrice }),
    });
    const d = await res.json();
    setSaving(false);
    if (res.ok) { window.dispatchEvent(new CustomEvent("game:balance")); onBought(); }
    else setErr(d.error ?? "Помилка");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">Купити обладнання</h3>
            <p className="text-xs text-gray-500 mt-0.5">{workshopName} · {freeM2.toFixed(0)} м² вільно</p>
          </div>
          <button onClick={onClose} aria-label="Закрити" className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {loading && <p className="text-gray-500 text-sm text-center py-8">Завантаження…</p>}
          {!loading && catalog.length === 0 && <p className="text-gray-500 text-sm text-center py-8">Каталог порожній</p>}
          {catalog.map((item) => (
            <button
              key={item.id}
              onClick={() => item.canBuy ? (setSelected(item), setErr("")) : undefined}
              disabled={!item.canBuy}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                !item.canBuy
                  ? "border-gray-800 bg-gray-900 opacity-40 cursor-not-allowed"
                  : selected?.id === item.id
                  ? "border-emerald-600 bg-emerald-950/30"
                  : "border-gray-800 bg-gray-900 hover:border-gray-700",
              )}
            >
              <span className="text-xl shrink-0">{productEmoji(item.sku)}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{item.name}</p>
                <p className="text-xs text-gray-500">Займає {item.footprintM2} м²{!item.canBuy ? " · не вміщається" : ""}</p>
              </div>
              <span className="text-sm font-mono text-gray-300">₴{(item.basePrice / 1000).toFixed(0)}K</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="px-5 pb-4 pt-3 border-t border-gray-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between rounded-lg bg-gray-900 border border-gray-800 px-4 py-3">
              <div>
                <p className="text-xs text-gray-500">Вартість</p>
                <p className="text-base font-semibold text-white">₴{selected.basePrice.toLocaleString("uk")}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">ТО/обслуговування</p>
                <p className="text-sm text-amber-400">₴{(selected.basePrice * 0.03).toLocaleString("uk", { maximumFractionDigits: 0 })}/міс</p>
              </div>
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500" onClick={buy} disabled={saving}>
                {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : <Plus size={13} className="mr-1" />}
                Придбати
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const MACHINERY_YIELD_BONUS_UI: Record<string, number> = {
  TRACTOR: 20, COMBINE_HARVESTER: 30, SEEDER: 10, SPRAYER: 5,
};
const MACHINERY_EMOJI_UI: Record<string, string> = {
  TRACTOR: "🚜", COMBINE_HARVESTER: "🌾", SEEDER: "🌱", SPRAYER: "💧",
};

export default function WorkshopsTab({
  enterprise, onRefresh, agroInfo,
}: { enterprise: EnterpriseData; onRefresh: () => void; agroInfo?: AgroInfo | null }) {
  const [recipeModal, setRecipeModal] = useState<Workshop | null>(null);
  const [addModal,    setAddModal]    = useState(false);
  const [savingVolume, setSavingVolume] = useState<string | null>(null);
  const [volumeMap, setVolumeMap]     = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const w of enterprise.workshops) m[w.id] = w.currentVolume;
    return m;
  });
  const [cancelSaving,  setCancelSaving]  = useState<string | null>(null);
  const [equipBusy,     setEquipBusy]     = useState<string | null>(null);
  const [equipMsg,      setEquipMsg]      = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [buyEquipWs,    setBuyEquipWs]    = useState<Workshop | null>(null);
  const [machinery,     setMachinery]     = useState<any[]>([]);
  const [livestock,     setLivestock]     = useState<any[]>([]);
  const [machRepBusy,   setMachRepBusy]   = useState<string | null>(null);
  const [autoToggleBusy, setAutoToggleBusy] = useState<string | null>(null);
  const [seedQualityBusy, setSeedQualityBusy] = useState(false);
  const [diseaseBusy,   setDiseaseBusy]   = useState(false);
  const [tourismBusy,   setTourismBusy]   = useState(false);
  const [dryGrainBusy,     setDryGrainBusy]     = useState(false);
  const [soilAnalysisBusy, setSoilAnalysisBusy] = useState(false);
  const [soilAnalysisData, setSoilAnalysisData] = useState<null | {
    warnings: string[]; suggestions: string[];
    npk: { nitrogen: { level: number }; phosphorus: { level: number }; potassium: { level: number } };
    moisture: { level: number };
    grain: { moisturePct: number; qualityClass: number; qualityLabel: string };
    estimatedYieldEfficiency: number;
  }>(null);
  const [insuranceBusy, setInsuranceBusy] = useState(false);
  const [fieldOpBusy,   setFieldOpBusy]   = useState<string | null>(null);

  useEffect(() => {
    if (enterprise.type !== "AGRO_FARM") return;
    fetch(`/api/enterprises/${enterprise.id}/machinery`)
      .then(r => r.json())
      .then(d => setMachinery(d.machinery ?? []))
      .catch(err => console.error("WorkshopsTab: machinery fetch failed", err));
    fetch(`/api/enterprises/${enterprise.id}/livestock`)
      .then(r => r.json())
      .then(d => setLivestock(d.herds ?? []))
      .catch(err => console.error("WorkshopsTab: livestock fetch failed", err));
  }, [enterprise.id, enterprise.type]);

  async function repairMachinery(machId: string) {
    setMachRepBusy(machId);
    await fetch(`/api/enterprises/${enterprise.id}/machinery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repair", machineryId: machId }),
    });
    const d = await fetch(`/api/enterprises/${enterprise.id}/machinery`).then(r => r.json());
    setMachinery(d.machinery ?? []);
    setMachRepBusy(null);
    window.dispatchEvent(new CustomEvent("game:balance"));
  }

  async function doEquipAction(eqId: string, action: "maintenance" | "repair") {
    setEquipBusy(eqId);
    setEquipMsg(null);
    const res = await fetch(`/api/equipment/${eqId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    setEquipBusy(null);
    if (res.ok) {
      const label = action === "repair" ? "відремонтовано" : "ТО виконано";
      setEquipMsg({ id: eqId, ok: true, text: `✓ ${label}` });
      window.dispatchEvent(new CustomEvent("game:balance"));
      onRefresh();
    } else {
      setEquipMsg({ id: eqId, ok: false, text: d.error ?? "Помилка" });
    }
  }

  async function saveVolume(workshopId: string) {
    setSavingVolume(workshopId);
    await fetch(`/api/workshops/${workshopId}/volume`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentVolume: volumeMap[workshopId] ?? 0 }),
    });
    setSavingVolume(null);
  }

  async function cancelOrder(workshopId: string, orderId: string) {
    setCancelSaving(orderId);
    await fetch(`/api/workshops/${workshopId}/order/${orderId}`, { method: "DELETE" });
    setCancelSaving(null);
    onRefresh();
  }

  const [agroActing, setAgroActing] = useState<string | null>(null);
  const [agroMsg,    setAgroMsg]    = useState("");

  async function doAgroAction(action: "fertilize" | "fertilize_organic" | "pesticide") {
    setAgroActing(action);
    setAgroMsg("");
    let url  = "/api/agro/pesticide";
    let body: Record<string, unknown> = { enterpriseId: enterprise.id };
    if (action === "fertilize")         { url = "/api/agro/fertilize"; body.fertilizerType = "CONCENTRATE"; }
    if (action === "fertilize_organic") { url = "/api/agro/fertilize"; body.fertilizerType = "ORGANIC"; }
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setAgroMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
    setAgroActing(null);
  }

  async function harvestField(workshopId: string) {
    setAgroActing("harvest_" + workshopId);
    setAgroMsg("");
    const res = await fetch("/api/agro/harvest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workshopId }),
    });
    const d = await res.json();
    setAgroMsg(res.ok ? `✓ Зібрано ${d.harvested?.toFixed(1)} кг → склад` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
    setAgroActing(null);
  }

  async function toggleAutoWorkshop(workshopId: string, field: "autoHarvest" | "autoFertilize", current: boolean) {
    setAutoToggleBusy(workshopId + field);
    const res = await fetch(`/api/workshops/${workshopId}/auto`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !current }),
    });
    if (res.ok) onRefresh();
    setAutoToggleBusy(null);
  }

  async function doDiseaseTreatment() {
    setDiseaseBusy(true);
    setAgroMsg("");
    const res = await fetch("/api/agro/disease-treatment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId: enterprise.id }),
    });
    const d = await res.json();
    setAgroMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
    setDiseaseBusy(false);
  }

  async function changeSeedQuality(seedQuality: string) {
    setSeedQualityBusy(true);
    setAgroMsg("");
    const res = await fetch("/api/agro/seed-quality", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId: enterprise.id, seedQuality }),
    });
    const d = await res.json();
    setAgroMsg(res.ok ? `✓ Насіння: ${seedQuality}${d.costPaid ? ` (−₴${d.costPaid.toLocaleString('uk-UA')})` : ''}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
    setSeedQualityBusy(false);
  }

  async function doFieldOp(workshopId: string, op: string) {
    setFieldOpBusy(workshopId + op);
    setAgroMsg("");
    const res = await fetch("/api/agro/field-ops", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workshopId, op }),
    });
    const d = await res.json();
    setAgroMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
    setFieldOpBusy(null);
  }

  async function toggleTourism(enabled: boolean) {
    setTourismBusy(true);
    setAgroMsg("");
    const res = await fetch("/api/agro/tourism", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId: enterprise.id, enabled }),
    });
    const d = await res.json();
    setAgroMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
    setTourismBusy(false);
  }

  const doDryGrain = async () => {
    const wsId = enterprise.workshops.find(w => w.isActive)?.id;
    if (!wsId) return;
    setDryGrainBusy(true);
    try {
      const r = await fetch('/api/agro/dry-grain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId: wsId }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error ?? 'Помилка'); return; }
      alert(d.message);
      onRefresh();
    } finally { setDryGrainBusy(false); }
  };

  const doSoilAnalysis = async () => {
    setSoilAnalysisBusy(true);
    try {
      const r = await fetch(`/api/agro/soil-analysis?enterpriseId=${enterprise.id}`);
      const d = await r.json();
      if (!r.ok) { alert(d.error ?? 'Помилка'); return; }
      setSoilAnalysisData(d);
    } finally { setSoilAnalysisBusy(false); }
  };

  const buyInsurance = async () => {
    setInsuranceBusy(true);
    try {
      const r = await fetch('/api/licenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enterpriseId: enterprise.id, licenseType: 'AGRO_INSURANCE' }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error ?? 'Помилка купівлі страховки'); return; }
      alert('Страхування активовано!');
      onRefresh();
    } finally { setInsuranceBusy(false); }
  };

  const freeArea = enterprise.totalFloorAreaM2 - enterprise.usedFloorAreaM2;

  return (
    <div className="space-y-4">
      {/* Add workshop button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{enterprise.workshops.length} {enterprise.workshops.length === 1 ? "цех" : "цехи"} · {freeArea.toFixed(0)} м² вільно</p>
        <Button size="sm" variant="outline" onClick={() => setAddModal(true)}>
          <Plus size={13} /> Додати цех
        </Button>
      </div>

      {enterprise.workshops.length === 0 ? (
        <div className="py-16 text-center">
          <Factory size={28} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-3">Цехів немає</p>
          <Button size="sm" onClick={() => setAddModal(true)}><Plus size={13} /> Додати перший цех</Button>
        </div>
      ) : (
        enterprise.workshops.map(w => {
          const brokenCount = w.equipment.filter(e => e.status === "BROKEN").length;
          const wornCount   = w.equipment.filter(e => e.status === "WORN").length;
          const vol         = volumeMap[w.id] ?? w.currentVolume;
          const capacityPct = w.maxCapacity > 0 ? Math.round((vol / w.maxCapacity) * 100) : 0;
          const activeOrder = w.productionOrders[0] ?? null;

          // ── AGRO_FARM: unified field card ──────────────────────────────────────
          if (enterprise.type === 'AGRO_FARM') {
            const cropSku    = activeOrder?.recipe?.outputs[0]?.product.sku ?? null;
            const cropName   = activeOrder?.recipe?.outputs[0]?.product.nameUa ?? null;
            const cropUnit   = activeOrder?.recipe?.outputs[0]?.product.unit ?? "кг";
            const soilQ      = agroInfo?.soilQuality ?? 0;
            const soilMult   = agroInfo ? soilQ / 7.0 : 1.0;
            const seasonIdx  = agroInfo?.seasonIndex ?? 0;
            const seasonMult = cropSku ? (AGRO_SEASON_MULTS_UI[cropSku]?.[seasonIdx] ?? 1.0) : 1.0;
            const SEASON_UA  = ["🌸 Весна", "☀️ Літо", "🍂 Осінь", "❄️ Зима"];
            const seasonName = SEASON_UA[seasonIdx] ?? "—";
            const fertLeft   = agroInfo?.fertilizerTicksLeft ?? 0;
            const pestDmg    = agroInfo?.pestDamageMult ?? 1.0;
            const activeMach  = machinery.filter((m: any) => m.isOperational && m.durability > 0);
            const machBonus   = activeMach.reduce((s: number, m: any) => s + (MACHINERY_YIELD_BONUS_UI[m.type] ?? 0), 0);
            const machMult    = 1 + machBonus / 100;
            const isField     = FIELD_CROPS_UI.has(cropSku ?? '');
            const LIVESTOCK_CROP_SKUS = new Set(['RM-MILK', 'SF-MILK', 'RM-LIVESTOCK', 'FG-EGGS']);
            const isLivestockCrop = LIVESTOCK_CROP_SKUS.has(cropSku ?? '');
            const avgHealth   = livestock.length > 0
              ? livestock.reduce((s: number, h: any) => s + (h.health ?? 1), 0) / livestock.length
              : null;
            const SPECIES_UA: Record<string, string> = { CATTLE: "🐄 ВРХ", PIGS: "🐷 Свині", POULTRY: "🐔 Птиця" };
            const estYield   = cropSku && seasonMult > 0 ? w.footprintM2 * soilMult * seasonMult * machMult : 0;
            const lastCrop   = agroInfo?.lastCropSku ?? null;
            let rotStatus: 'optimal' | 'mono' | 'neutral' | null = null;
            if (cropSku && isField) {
              if (lastCrop === cropSku) rotStatus = 'mono';
              else if (lastCrop && ROTATION_NEXT_UI[lastCrop] === cropSku) rotStatus = 'optimal';
              else rotStatus = 'neutral';
            }
            const hasHarvest    = w.harvestAccumulated >= 0.1 && isField;
            const agros         = enterprise.employees.filter(e => e.profession === "AGRONOMIST").length;
            const agronMult     = 1 + Math.min(agros, 2) * 0.08;
            const hasIrrigation = w.equipment.some(eq =>
              eq.name?.includes("EQ-IRRIGATION") || eq.nameUa?.toLowerCase().includes("зрошен")
            );
            const weatherMod    = enterprise.localWeatherMod ?? 1.0;
            const weatherDesc   = enterprise.localWeatherDesc ?? null;
            const soilTrend        = fertLeft > 0 ? "up" : soilQ <= 5 ? "down" : "stable";
            const seedQuality      = agroInfo?.seedQuality ?? 'STANDARD';
            const cropDiseaseType  = agroInfo?.cropDiseaseType ?? null;
            const cropDiseaseSev   = agroInfo?.cropDiseaseSeverity ?? 0;
            const fieldOpsMask     = agroInfo?.fieldOpsMask ?? 0;
            const opCost           = Math.ceil(w.footprintM2); // ₴1/м²

            return (
              <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {SKU_EMOJI[cropSku ?? ''] ?? "🌿"} {w.name}
                      <span className="ml-2 text-xs text-gray-500 font-normal">{w.footprintM2} м²</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cropName ? (RECIPE_UA[activeOrder?.recipe?.name ?? ''] ?? cropName) : <span className="text-amber-400">Культуру не призначено</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {brokenCount > 0 && <span className="text-xs text-red-400 bg-red-500/10 rounded px-1.5 py-0.5"><Hammer size={9} className="inline mr-0.5" />{brokenCount}</span>}
                    <span className={cn("text-xs rounded-full px-2 py-0.5", w.isActive ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 bg-gray-800")}>
                      {w.isActive ? "Активне" : "Зупинено"}
                    </span>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {/* Soil + Season row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded bg-gray-800/50 px-2 py-1.5 space-y-1">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Ґрунт</p>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full bg-gray-700">
                          <div className={cn("h-full rounded-full", soilQ >= 7 ? "bg-emerald-500" : soilQ >= 4 ? "bg-amber-500" : "bg-red-500")}
                            style={{ width: `${(soilQ / 10) * 100}%` }} />
                        </div>
                        <span className={cn("text-xs font-mono", soilQ >= 7 ? "text-emerald-400" : soilQ >= 4 ? "text-amber-400" : "text-red-400")}>{soilQ.toFixed(1)}/10</span>
                      </div>
                      {fertLeft > 0
                        ? <p className="text-xs text-emerald-400">🌱 +20% добриво · {Math.ceil(fertLeft / 30)} сез</p>
                        : <p className="text-xs text-gray-600">Без добрива</p>}
                      <p className={cn("text-xs", soilTrend === "up" ? "text-emerald-500" : soilTrend === "down" ? "text-red-400" : "text-gray-600")}>
                        {soilTrend === "up" ? "↑ покращується (+0.2/сез)" : soilTrend === "down" ? "↓ спадає (−0.1/сез)" : "→ стабільний"}
                      </p>
                      {pestDmg < 1.0 && <p className="text-xs text-red-400">🐛 Шкідники −{Math.round((1 - pestDmg) * 100)}%</p>}
                    </div>
                    <div className="rounded bg-gray-800/50 px-2 py-1.5 space-y-1">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Сезон</p>
                      <p className={cn("text-xs font-medium", seasonMult === 0 ? "text-red-400" : seasonMult >= 0.8 ? "text-emerald-400" : "text-amber-400")}>
                        {seasonName} · {Math.round(seasonMult * 100)}%
                      </p>
                      {rotStatus === 'optimal' && <p className="text-xs text-emerald-400">✓ Ротація +15%</p>}
                      {rotStatus === 'mono'    && <p className="text-xs text-red-400">✗ Монокультура −15%</p>}
                      {rotStatus === 'neutral' && lastCrop && <p className="text-xs text-gray-500">Рек.: {SKU_EMOJI[ROTATION_NEXT_UI[lastCrop] ?? ''] ?? ''} {ROTATION_NEXT_UI[lastCrop]}</p>}
                      {hasIrrigation
                        ? <p className="text-xs text-blue-400">💧 Зрошення: посуха −35% (не −60%)</p>
                        : <p className="text-xs text-gray-600">Без зрошення</p>}
                      {weatherDesc && weatherMod < 1.0 && (
                        <p className="text-xs text-orange-400">⛈ {weatherDesc} ×{Math.round(weatherMod * 100)}%</p>
                      )}
                    </div>
                  </div>

                  {/* Yield formula */}
                  {cropSku && (
                    <div className="rounded bg-gray-800/40 px-2 py-1.5 space-y-1">
                      <div className="flex items-center flex-wrap gap-1 text-xs">
                        <span className="font-mono text-white">{w.footprintM2} м²</span>
                        <span className="text-gray-600">×</span>
                        <span className={soilMult >= 0.85 ? "text-emerald-400" : soilMult >= 0.5 ? "text-amber-400" : "text-red-400"}>ґрунт {Math.round(soilMult * 100)}%</span>
                        <span className="text-gray-600">×</span>
                        <span className={seasonMult === 0 ? "text-red-400" : seasonMult >= 0.8 ? "text-emerald-400" : "text-amber-400"}>сезон {Math.round(seasonMult * 100)}%</span>
                        {machBonus > 0 && <>
                          <span className="text-gray-600">×</span>
                          <span className="text-emerald-400">техніка ×{machMult.toFixed(2)}</span>
                        </>}
                        {agros > 0 && <>
                          <span className="text-gray-600">×</span>
                          <span className="text-emerald-300">👨‍🌾×{Math.min(agros,2)} агрон. ×{agronMult.toFixed(2)}</span>
                        </>}
                        <span className="text-gray-600">=</span>
                        <span className={cn("font-semibold", estYield > 0 ? "text-white" : "text-red-400")}>
                          {estYield > 0 ? `~${(estYield * agronMult).toFixed(1)}/тік` : "0 — позасезонно"}
                        </span>
                      </div>
                      {activeMach.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {activeMach.map((m: any) => (
                            <span key={m.id} className="text-xs bg-emerald-900/30 text-emerald-400 px-1 py-0.5 rounded">
                              {MACHINERY_EMOJI_UI[m.type] ?? "⚙️"} +{MACHINERY_YIELD_BONUS_UI[m.type] ?? 0}%
                            </span>
                          ))}
                        </div>
                      )}
                      {activeMach.length === 0 && <p className="text-xs text-amber-600">⚠ Немає активної техніки — додайте у вкладці Техніка</p>}
                      {agros === 0 && isField && <p className="text-xs text-amber-600">⚠ Без агронома — можна +8–16% (найміть у вкладці Персонал)</p>}
                      {agros > 2 && <p className="text-xs text-gray-500">ℹ 2+ агрономи — бонус обмежено +16%</p>}
                    </div>
                  )}

                  {/* Harvest */}
                  {hasHarvest && (
                    <div className="rounded bg-amber-950/30 border border-amber-800/30 px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-amber-300">🌾 Готово до збору</p>
                        <p className="text-sm font-bold text-white">{w.harvestAccumulated.toFixed(1)} {cropUnit}</p>
                      </div>
                      <button
                        onClick={() => harvestField(w.id)}
                        disabled={agroActing === "harvest_" + w.id}
                        className="text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
                      >
                        {agroActing === "harvest_" + w.id ? <Loader2 size={10} className="animate-spin" /> : "Зібрати →"}
                      </button>
                    </div>
                  )}

                  {/* Recipe / crop */}
                  <div className="flex items-center justify-between">
                    <div>
                      {activeOrder?.recipe
                        ? <p className="text-sm font-medium text-white">{RECIPE_UA[activeOrder.recipe.name] ?? activeOrder.recipe.name}</p>
                        : <p className="text-sm text-amber-400">Призначте культуру</p>}
                      {activeOrder && <p className="text-xs text-gray-500 mt-0.5">{activeOrder.completedQuantity.toFixed(0)} / {activeOrder.targetQuantity >= 999_000 ? "∞" : activeOrder.targetQuantity} вироблено</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {activeOrder && (
                        <button onClick={() => cancelOrder(w.id, activeOrder.id)} disabled={cancelSaving === activeOrder.id}
                          className="text-xs text-red-400 bg-red-500/10 border border-red-500/15 rounded px-2 py-1 hover:text-red-300 transition-colors">
                          {cancelSaving === activeOrder.id ? <Loader2 size={10} className="animate-spin" /> : "Зупинити"}
                        </button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setRecipeModal(w)}>
                        <BookOpen size={11} /> {activeOrder ? "Змінити" : "Призначити"}
                      </Button>
                    </div>
                  </div>

                  {/* Equipment compact */}
                  <div className="pt-1.5 border-t border-gray-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-600 uppercase tracking-wider">Обладнання цеху</p>
                      <button onClick={() => setBuyEquipWs(w)} className="text-xs text-emerald-400 hover:text-emerald-300">+ Купити</button>
                    </div>
                    {w.equipment.length === 0 && (
                      <p className="text-xs text-amber-500">⚠ Без обладнання — виробництво неможливе</p>
                    )}
                    {w.equipment.map(eq => {
                      const busy = equipBusy === eq.id;
                      const msg  = equipMsg?.id === eq.id ? equipMsg : null;
                      return (
                        <div key={eq.id}>
                          <div className="flex items-center gap-2 text-xs">
                            <Cpu size={10} className="text-gray-600 shrink-0" />
                            <span className="flex-1 text-gray-400 truncate">{eq.nameUa ?? eq.name}</span>
                            <div className="w-12 shrink-0"><WearBar value={eq.wearAndTear} /></div>
                            <span className={cn("shrink-0", STATUS_COLOR[eq.status] ?? "text-gray-400")}>{STATUS_UA[eq.status] ?? eq.status}</span>
                            {eq.isBroken ? (
                              <button onClick={() => doEquipAction(eq.id, "repair")} disabled={busy}
                                className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50">
                                {busy ? <Loader2 size={9} className="animate-spin" /> : "Рем."}
                              </button>
                            ) : (eq.status === "WORN" || eq.wearAndTear > 0.3) ? (
                              <button onClick={() => doEquipAction(eq.id, "maintenance")} disabled={busy}
                                className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50">
                                {busy ? <Loader2 size={9} className="animate-spin" /> : "ТО"}
                              </button>
                            ) : null}
                          </div>
                          {msg && <p className={cn("text-xs mt-0.5 pl-4", msg.ok ? "text-emerald-400" : "text-red-400")}>{msg.text}</p>}
                        </div>
                      );
                    })}
                  </div>

                  {/* FarmMachinery panel */}
                  {machinery.length > 0 && (
                    <div className="pt-1.5 border-t border-gray-800 space-y-1">
                      <p className="text-xs text-gray-600 uppercase tracking-wider">Техніка підприємства</p>
                      {machinery.map((m: any) => {
                        const dur = m.durability ?? 1;
                        const isBroken = !m.isOperational || dur <= 0;
                        const isWorn   = dur < 0.3 && !isBroken;
                        return (
                          <div key={m.id} className="flex items-center gap-2 text-xs">
                            <span className="shrink-0">{MACHINERY_EMOJI_UI[m.type] ?? "⚙️"}</span>
                            <span className="flex-1 text-gray-400 truncate">{m.nameUa ?? m.type}</span>
                            <div className="w-12 shrink-0 h-1 rounded-full bg-gray-700">
                              <div className={cn("h-full rounded-full", dur > 0.5 ? "bg-emerald-500" : dur > 0.2 ? "bg-amber-500" : "bg-red-500")}
                                style={{ width: `${Math.max(0, dur * 100)}%` }} />
                            </div>
                            <span className={cn("shrink-0 text-xs", isBroken ? "text-red-400" : isWorn ? "text-amber-400" : "text-emerald-400")}>
                              {isBroken ? "Зламано" : isWorn ? "Зношено" : `${Math.round(dur * 100)}%`}
                            </span>
                            {(isBroken || isWorn) && (
                              <button onClick={() => repairMachinery(m.id)} disabled={machRepBusy === m.id}
                                className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50">
                                {machRepBusy === m.id ? <Loader2 size={8} className="animate-spin" /> : "Рем."}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Livestock health panel */}
                  {isLivestockCrop && (
                    <div className="pt-1.5 border-t border-gray-800 space-y-1">
                      <p className="text-xs text-gray-600 uppercase tracking-wider">Стадо</p>
                      {livestock.length === 0 ? (
                        <p className="text-xs text-red-400">⚠ Немає стада — виробництво неможливе</p>
                      ) : livestock.map((h: any) => {
                        const hp  = h.health ?? 1;
                        const skipped = h.feedSkippedTicks ?? 0;
                        return (
                          <div key={h.id} className="flex items-center gap-2 text-xs">
                            <span className="shrink-0">{SPECIES_UA[h.species] ?? h.species}</span>
                            <span className="text-gray-500">{h.headCount} гол.</span>
                            <div className="flex-1 h-1 rounded-full bg-gray-700">
                              <div className={cn("h-full rounded-full", hp >= 0.7 ? "bg-emerald-500" : hp >= 0.4 ? "bg-amber-500" : "bg-red-500")}
                                style={{ width: `${hp * 100}%` }} />
                            </div>
                            <span className={cn("shrink-0 font-mono", hp >= 0.7 ? "text-emerald-400" : hp >= 0.4 ? "text-amber-400" : "text-red-400")}>
                              {Math.round(hp * 100)}%
                            </span>
                            {skipped > 0 && <span className="text-xs text-red-400">😟 −{skipped}тік корму</span>}
                          </div>
                        );
                      })}
                      {avgHealth !== null && avgHealth < 0.5 && (
                        <p className="text-xs text-red-400">⚠ Здоров&apos;я &lt;50% — продуктивність впала. Поповніть RM-CORN.</p>
                      )}
                    </div>
                  )}

                  {/* Crop disease panel */}
                  {cropDiseaseType && (
                    <div className="rounded bg-red-950/40 border border-red-700/30 px-2 py-2 space-y-1 pt-1.5">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">🦠 Хвороба поля</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-red-300 font-medium">
                            {cropDiseaseType === 'FUNGAL' ? 'Грибок' : 'Вірус'} · −{Math.round(cropDiseaseSev * 50)}% врожаю
                          </p>
                          <div className="mt-1 w-24 h-1 rounded-full bg-gray-700">
                            <div className="h-full rounded-full bg-red-500" style={{ width: `${cropDiseaseSev * 100}%` }} />
                          </div>
                        </div>
                        <button onClick={doDiseaseTreatment} disabled={diseaseBusy}
                          className="text-xs rounded-lg bg-purple-700 hover:bg-purple-600 text-white px-2.5 py-1.5 font-medium disabled:opacity-40 transition-colors shrink-0">
                          {diseaseBusy ? <Loader2 size={10} className="animate-spin" /> : "💊 Лікувати"}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">Потрібно 8 кг RM-PESTICIDE</p>
                    </div>
                  )}

                  {/* ── Польові роботи ── */}
                  {isField && (
                    <div className="pt-1.5 border-t border-gray-800 space-y-1.5">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">📋 Польові роботи · ₴1/м²</p>
                      {([
                        { op: 'PLOW',      bit: 1,  icon: '🚜', label: 'Оранка',          bonus: '+8%'  },
                        { op: 'CULTIVATE', bit: 2,  icon: '🌾', label: 'Культивація',     bonus: '+6%'  },
                        { op: 'SOW',       bit: 4,  icon: '🌱', label: 'Посів',           bonus: '+5%'  },
                        { op: 'FERTILIZE', bit: 8,  icon: '💧', label: 'Внесення добрив', bonus: '+20%' },
                        { op: 'HARVEST',   bit: 16, icon: '📦', label: 'Збір врожаю',     bonus: null   },
                      ] as const).map(({ op, bit, icon, label, bonus }) => {
                        const done  = (fieldOpsMask & bit) !== 0;
                        const busy  = fieldOpBusy === w.id + op;
                        const skipHarvest = op === 'HARVEST' && w.harvestAccumulated < 0.1;
                        return (
                          <div key={op} className={cn(
                            "flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                            done ? "bg-emerald-950/30 border border-emerald-800/20" : "bg-gray-800/40"
                          )}>
                            <span className="shrink-0 w-4">{done ? '✅' : '⬜'}</span>
                            <span className="shrink-0">{icon}</span>
                            <span className={cn("flex-1", done ? "text-emerald-300" : "text-gray-300")}>{label}</span>
                            {bonus && (
                              <span className={cn("text-xs font-mono shrink-0", done ? "text-emerald-400" : "text-gray-600")}>
                                {bonus}
                              </span>
                            )}
                            {!done && !skipHarvest && (
                              <button
                                onClick={() => doFieldOp(w.id, op)}
                                disabled={!!fieldOpBusy}
                                className="shrink-0 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded px-2 py-0.5 disabled:opacity-40 transition-colors"
                              >
                                {busy ? <Loader2 size={8} className="animate-spin inline" /> : `₴${opCost.toLocaleString('uk-UA')}`}
                              </button>
                            )}
                            {done && op !== 'HARVEST' && (
                              <span className="text-xs text-emerald-500 shrink-0">✓ виконано</span>
                            )}
                            {skipHarvest && <span className="text-xs text-gray-600 shrink-0">немає врожаю</span>}
                          </div>
                        );
                      })}
                      <p className="text-xs text-gray-600">Скидається щосезону. Бонуси множаться до врожаю.</p>
                    </div>
                  )}

                  {/* NPK Panel */}
                  {isField && (agroInfo?.nitrogenLevel !== undefined) && (
                    <div className="pt-1.5 border-t border-gray-800 space-y-1.5">
                      <button
                        onClick={doSoilAnalysis}
                        disabled={soilAnalysisBusy}
                        className="w-full text-xs rounded bg-blue-900/30 border border-blue-700/40 text-blue-300 hover:bg-blue-800/40 px-2 py-1 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {soilAnalysisBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔬'}
                        Аналіз ґрунту
                      </button>
                      <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        🧪 NPK ґрунту
                        <InfoTooltip text="Рівень азоту/фосфору/калію в ґрунті (0-100). Кожен нутрієнт додає до +15% врожайності польових культур. Падає з кожним врожаєм, відновлюється добривом." />
                      </p>
                      {[
                        { label: 'N Азот',    val: agroInfo?.nitrogenLevel ?? 70,   color: 'bg-blue-500'   },
                        { label: 'P Фосфор',  val: agroInfo?.phosphorusLevel ?? 70, color: 'bg-orange-500' },
                        { label: 'K Калій',   val: agroInfo?.potassiumLevel ?? 70,  color: 'bg-purple-500' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="flex items-center gap-2 text-xs">
                          <span className="w-16 text-gray-400 shrink-0">{label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-700">
                            <div className={cn("h-full rounded-full transition-all", color,
                              val < 40 ? "opacity-50" : val < 60 ? "opacity-75" : "opacity-100"
                            )} style={{ width: `${val}%` }} />
                          </div>
                          <span className={cn("text-xs font-mono w-10 text-right shrink-0",
                            val < 40 ? "text-red-400" : val < 60 ? "text-amber-400" : "text-emerald-400"
                          )}>{val.toFixed(0)}%</span>
                        </div>
                      ))}
                      {((agroInfo?.nitrogenLevel ?? 70) < 40 || (agroInfo?.phosphorusLevel ?? 70) < 40 || (agroInfo?.potassiumLevel ?? 70) < 40) && (
                        <p className="text-xs text-amber-500">⚠ Нутрієнти низькі — внесіть добриво для відновлення NPK</p>
                      )}
                    </div>
                  )}

                  {/* Moisture + Growth Stage Panel */}
                  {isField && (
                    <div className="pt-1.5 border-t border-gray-800 space-y-1.5">
                      {/* Волога */}
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wider w-20 shrink-0">💧 Волога</p>
                        <div className="flex-1 h-1.5 rounded-full bg-gray-700">
                          {(() => {
                            const m = agroInfo?.moistureLevel ?? 60;
                            const pct = Math.min(100, m);
                            const barColor = m < 25 ? 'bg-red-500' : m < 45 ? 'bg-amber-500' : m <= 75 ? 'bg-blue-500' : 'bg-blue-300';
                            return <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />;
                          })()}
                        </div>
                        {(() => {
                          const m = agroInfo?.moistureLevel ?? 60;
                          return (
                            <span className={cn("text-xs font-mono w-10 text-right shrink-0",
                              m < 25 ? "text-red-400" : m < 45 ? "text-amber-400" : m <= 75 ? "text-blue-400" : "text-blue-300"
                            )}>{m.toFixed(0)}%</span>
                          );
                        })()}
                      </div>
                      {(agroInfo?.moistureLevel ?? 60) < 30 && <p className="text-xs text-red-400">🌵 Посуха! Встановіть зрошення або замовте польову роботу.</p>}
                      {(agroInfo?.moistureLevel ?? 60) > 80 && <p className="text-xs text-blue-400">🌊 Перезволоження — зменшить врожайність</p>}

                      {/* Стадія росту */}
                      {cropSku && agroInfo?.plantedSeasonTick !== undefined && (() => {
                        const ticksGrown = Math.max(0, (agroInfo?.tickNumber ?? 0) - (agroInfo?.plantedSeasonTick ?? 0));
                        const stage =
                          ticksGrown < 5  ? { name: '🌱 Проростання', pct: 10,  color: 'bg-gray-500' } :
                          ticksGrown < 15 ? { name: '🌿 Сіянець',      pct: 35,  color: 'bg-green-700' } :
                          ticksGrown < 25 ? { name: '🌳 Вегетація',    pct: 65,  color: 'bg-green-500' } :
                          ticksGrown < 35 ? { name: '🌸 Цвітіння',     pct: 85,  color: 'bg-emerald-400' } :
                                            { name: '🌾 Дозрівання',    pct: 100, color: 'bg-amber-400' };
                        return (
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 uppercase tracking-wider">Стадія росту</span>
                              <span className="text-white font-medium">{stage.name}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-700">
                              <div className={cn("h-full rounded-full transition-all", stage.color)} style={{ width: `${stage.pct}%` }} />
                            </div>
                            <p className="text-xs text-gray-600">{ticksGrown} тіків з посіву</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Grain Quality + Moisture Panel */}
                  {isField && cropSku && (
                    <div className="rounded bg-gray-800/40 px-2 py-1.5 space-y-1">
                      <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        🌾 Якість зерна
                        <InfoTooltip text="Клас визначається якістю ґрунту, рівнем NPK і вологою на момент збору врожаю. Клас 1 (Преміум) вимагає високої якості ґрунту, NPK ≥65% і оптимальної вологи 45-75%." />
                      </p>
                      <div className="flex items-center justify-between">
                        {(() => {
                          const cls = agroInfo?.grainQualityClass ?? 2;
                          const label = cls === 1 ? '⭐ Клас 1 — Преміум' : cls === 2 ? '📦 Клас 2 — Стандарт' : '🐄 Клас 3 — Фураж';
                          const mult  = cls === 1 ? '×1.3 ціна' : cls === 2 ? '×1.0 ціна' : '×0.8 ціна';
                          const color = cls === 1 ? 'text-amber-300' : cls === 2 ? 'text-gray-300' : 'text-red-400';
                          return (
                            <>
                              <span className={cn("text-xs font-medium", color)}>{label}</span>
                              <span className={cn("text-xs font-mono", color)}>{mult}</span>
                            </>
                          );
                        })()}
                      </div>
                      {(agroInfo?.grainMoisturePct ?? 14) > 17 && (
                        <p className="text-xs text-amber-500">💧 Вологість зерна {(agroInfo?.grainMoisturePct ?? 14).toFixed(1)}% — потрібне сушіння (норма ≤14%)</p>
                      )}
                      {(agroInfo?.grainMoisturePct ?? 14) <= 14 && (
                        <p className="text-xs text-emerald-500">✓ Вологість {(agroInfo?.grainMoisturePct ?? 14).toFixed(1)}% — норма</p>
                      )}
                      {(agroInfo?.grainMoisturePct ?? 14) > 14 && (
                        <button
                          onClick={doDryGrain}
                          disabled={dryGrainBusy}
                          className="mt-1 w-full text-xs rounded bg-amber-900/40 border border-amber-700/50 text-amber-300 hover:bg-amber-800/40 px-2 py-1 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {dryGrainBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔥'}
                          Просушити до 14%
                          {(agroInfo?.grainMoisturePct ?? 14) > 14 && (() => {
                            const drop = (agroInfo?.grainMoisturePct ?? 14) - 14;
                            const tonnes = (w.harvestAccumulated ?? 0) / 1000;
                            const cost = Math.ceil(drop * tonnes * 35);
                            return cost > 0 ? <span className="text-amber-500 font-mono">≈ ₴{cost.toLocaleString('uk-UA')}</span> : null;
                          })()}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Seed quality + auto toggles */}
                  <div className="pt-1.5 border-t border-gray-800 space-y-2">
                    {/* Seed quality selector */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Насіння</p>
                      <div className="flex gap-1">
                        {(['BASIC','STANDARD','PREMIUM'] as const).map(q => (
                          <button key={q} disabled={seedQualityBusy || seedQuality === q}
                            onClick={() => changeSeedQuality(q)}
                            className={cn("text-xs px-1.5 py-0.5 rounded transition-colors",
                              seedQuality === q ? "bg-emerald-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                            )}>
                            {q === 'BASIC' ? '−25%' : q === 'STANDARD' ? 'Станд.' : '+30% ₴5к'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Auto-harvest / auto-fertilize toggles */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => toggleAutoWorkshop(w.id, 'autoHarvest', w.autoHarvest)}
                        disabled={autoToggleBusy === w.id + 'autoHarvest'}
                        className={cn("text-xs rounded px-2 py-1 transition-colors",
                          w.autoHarvest ? "bg-amber-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                        )}>
                        {autoToggleBusy === w.id + 'autoHarvest' ? <Loader2 size={8} className="animate-spin inline" /> : null}
                        {' '}🌾 Авто-збір {w.autoHarvest ? 'ВКЛ' : 'ВИКЛ'}
                      </button>
                      <button onClick={() => toggleAutoWorkshop(w.id, 'autoFertilize', w.autoFertilize)}
                        disabled={autoToggleBusy === w.id + 'autoFertilize'}
                        className={cn("text-xs rounded px-2 py-1 transition-colors",
                          w.autoFertilize ? "bg-emerald-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                        )}>
                        {autoToggleBusy === w.id + 'autoFertilize' ? <Loader2 size={8} className="animate-spin inline" /> : null}
                        {' '}🌱 Авто-добриво {w.autoFertilize ? 'ВКЛ' : 'ВИКЛ'}
                      </button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-1.5 pt-1.5 border-t border-gray-800 flex-wrap">
                    {/* Concentrate fertilizer: 0.03 kg/m² × area, ₴200/kg */}
                    {(() => {
                      const area          = enterprise.footprintM2;
                      const concKg        = Math.ceil(0.03 * area);
                      const concCost      = concKg * 200;
                      const compostKg     = Math.ceil(4 * area);
                      const compostCost   = (compostKg * 1.3).toFixed(0);
                      const fertDisabled  = !!agroActing || fertLeft > 0;
                      return (
                        <>
                          <button onClick={() => doAgroAction("fertilize")} disabled={fertDisabled}
                            className="text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 font-medium disabled:opacity-40 transition-colors flex flex-col items-start leading-tight">
                            {agroActing === "fertilize" ? <Loader2 size={10} className="animate-spin" /> : (
                              <>
                                <span>🧪 Концентрат</span>
                                <span className="text-xs opacity-75">{concKg} кг · ₴{concCost.toLocaleString('uk-UA')}</span>
                              </>
                            )}
                          </button>
                          <button onClick={() => doAgroAction("fertilize_organic")} disabled={fertDisabled}
                            className="text-xs rounded-lg bg-teal-800 hover:bg-teal-700 text-white px-2.5 py-1.5 font-medium disabled:opacity-40 transition-colors flex flex-col items-start leading-tight">
                            {agroActing === "fertilize_organic" ? <Loader2 size={10} className="animate-spin" /> : (
                              <>
                                <span>🌿 Компост</span>
                                <span className="text-xs opacity-75">{compostKg.toLocaleString('uk-UA')} кг · ₴{Number(compostCost).toLocaleString('uk-UA')}</span>
                              </>
                            )}
                          </button>
                          <button onClick={() => doAgroAction("pesticide")} disabled={!!agroActing || pestDmg >= 1.0}
                            className="text-xs rounded-lg bg-orange-700 hover:bg-orange-600 text-white px-2.5 py-1.5 font-medium disabled:opacity-40 transition-colors">
                            {agroActing === "pesticide" ? <Loader2 size={10} className="animate-spin" /> : "🐛 Пестицид"}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  {agroMsg && <p className={`text-xs ${agroMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{agroMsg}</p>}
                </div>
              </div>
            );
          }

          // ── Generic card (non-AGRO_FARM) ────────────────────────────────────────
          return (
            <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{w.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{w.footprintM2} м² · макс {w.maxCapacity} од/тік</p>
                </div>
                <div className="flex items-center gap-2">
                  {brokenCount > 0 && <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/15 rounded px-1.5 py-0.5"><Hammer size={9} /> {brokenCount}</span>}
                  {wornCount > 0   && <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/15 rounded px-1.5 py-0.5"><Wrench size={9} /> {wornCount}</span>}
                  <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", w.isActive ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 bg-gray-800")}>
                    {w.isActive ? "Активний" : "Зупинено"}
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Volume control */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <SlidersHorizontal size={9} /> Обсяг виробництва
                    </span>
                    <span className="text-xs font-mono text-gray-400">{vol} / {w.maxCapacity} · {capacityPct}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0} max={w.maxCapacity} step={1}
                      value={vol}
                      onChange={e => setVolumeMap(m => ({ ...m, [w.id]: Number(e.target.value) }))}
                      className="flex-1 accent-emerald-500"
                    />
                    <button
                      onClick={() => saveVolume(w.id)}
                      disabled={savingVolume === w.id || vol === w.currentVolume}
                      className={cn(
                        "text-xs px-2 py-1 rounded font-medium transition-all",
                        vol !== w.currentVolume
                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                          : "bg-gray-800 text-gray-600 cursor-default",
                      )}
                    >
                      {savingVolume === w.id ? <Loader2 size={10} className="animate-spin" /> : "Зберегти"}
                    </button>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                    <div className={cn("h-full rounded-full", capacityPct >= 80 ? "bg-emerald-500" : capacityPct >= 40 ? "bg-amber-500" : "bg-gray-600")} style={{ width: `${capacityPct}%` }} />
                  </div>
                  {vol === 0 ? (
                    <p className="text-xs text-red-400 mt-1">⛔ Виробництво зупинено (обсяг = 0)</p>
                  ) : enterprise.type === 'AGRO_FARM' ? (() => {
                    const cropSku   = activeOrder?.recipe?.outputs[0]?.product.sku ?? null;
                    const soilMult  = agroInfo ? agroInfo.soilQuality / 7.0 : 1.0;
                    const seasonIdx = agroInfo?.seasonIndex ?? 0;
                    const seasonMult= cropSku ? (AGRO_SEASON_MULTS_UI[cropSku]?.[seasonIdx] ?? 1.0) : 1.0;
                    const activeMach= machinery.filter((m: any) => m.isOperational && m.durability > 0);
                    const machBonus = activeMach.reduce((s: number, m: any) => s + (MACHINERY_YIELD_BONUS_UI[m.type] ?? 0), 0);
                    const machMult  = 1 + machBonus / 100;
                    const estYield  = w.footprintM2 * soilMult * seasonMult * machMult;
                    const isCapped  = vol > 0 && estYield > vol;
                    return (
                      <div className="mt-1 space-y-1">
                        {/* Formula breakdown */}
                        <div className="rounded bg-gray-800/60 px-2 py-1.5 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap text-xs">
                            <span className="text-gray-500">Площа</span>
                            <span className="font-mono text-white">{w.footprintM2} м²</span>
                            <span className="text-gray-600">×</span>
                            <span className="text-gray-500">Ґрунт</span>
                            <span className={`font-mono ${soilMult >= 0.85 ? "text-emerald-400" : soilMult >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
                              {Math.round(soilMult * 100)}%
                            </span>
                            <span className="text-gray-600">×</span>
                            <span className="text-gray-500">Сезон</span>
                            <span className={`font-mono ${seasonMult === 0 ? "text-red-400" : seasonMult >= 0.8 ? "text-emerald-400" : "text-amber-400"}`}>
                              {Math.round(seasonMult * 100)}%
                            </span>
                            {machBonus > 0 && <>
                              <span className="text-gray-600">×</span>
                              <span className="text-gray-500">Техніка</span>
                              <span className="font-mono text-emerald-400">+{machBonus}%</span>
                            </>}
                            <span className="text-gray-600">=</span>
                            <span className={`font-mono font-semibold ${seasonMult === 0 ? "text-red-400" : "text-white"}`}>
                              {seasonMult === 0 ? "0 (позасезонно)" : `~${estYield.toFixed(1)} од/тік`}
                            </span>
                          </div>
                          {activeMach.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {activeMach.map((m: any) => (
                                <span key={m.id} className="text-xs bg-emerald-900/40 text-emerald-400 px-1 rounded">
                                  {MACHINERY_EMOJI_UI[m.type] ?? "⚙️"} +{MACHINERY_YIELD_BONUS_UI[m.type] ?? 0}%
                                </span>
                              ))}
                            </div>
                          )}
                          {activeMach.length === 0 && (
                            <p className="text-xs text-amber-600">⚠ Немає активної техніки</p>
                          )}
                        </div>
                        {isCapped && (
                          <p className="text-xs text-amber-500">⚠ Ліміт {vol} обмежує фактичний врожай {estYield.toFixed(0)} — підвищте ліміт</p>
                        )}
                      </div>
                    );
                  })() : (
                    <p className="text-xs text-gray-600 mt-1">Ліміт {vol} од/тік. Фактичне виробництво = min(ліміт, пропускна здатність обладнання, запас матеріалів).</p>
                  )}
                </div>

                {/* Recipe / Production Order */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Рецепт / продукт</p>
                    {activeOrder?.recipe ? (
                      <p className="text-sm text-white font-medium">{RECIPE_UA[activeOrder.recipe.name] ?? activeOrder.recipe.name}</p>
                    ) : (
                      <p className="text-sm text-amber-400">Рецепт не призначено</p>
                    )}
                    {activeOrder && (
                      <p className="text-xs text-gray-500 mt-0.5">{activeOrder.completedQuantity.toFixed(0)} / {activeOrder.targetQuantity >= 999_000 ? "∞" : activeOrder.targetQuantity} вироблено</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {activeOrder && (
                      <button
                        onClick={() => cancelOrder(w.id, activeOrder.id)}
                        disabled={cancelSaving === activeOrder.id}
                        className="text-xs text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/15 rounded px-2 py-1 transition-colors"
                      >
                        {cancelSaving === activeOrder.id ? <Loader2 size={11} className="animate-spin" /> : "Зупинити"}
                      </button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setRecipeModal(w)}>
                      <BookOpen size={12} /> {activeOrder ? "Змінити" : "Призначити"}
                    </Button>
                  </div>
                </div>

                {/* Equipment */}
                <div className="space-y-1.5 pt-1 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Обладнання</p>
                    <button
                      onClick={() => setBuyEquipWs(w)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                    >
                      <Plus size={10} /> Купити
                    </button>
                  </div>
                  {w.equipment.length === 0 && (
                    <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/15 rounded px-2 py-1.5">
                      Цех без обладнання — виробництво = 0. Додайте обладнання.
                    </p>
                  )}
                  {w.equipment.map(eq => {
                      const busy = equipBusy === eq.id;
                      const msg  = equipMsg?.id === eq.id ? equipMsg : null;
                      const maintCost = Number(eq.maintenanceCostUah);
                      return (
                        <div key={eq.id} className="border border-gray-800 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-3 text-xs px-3 py-2">
                            <Cpu size={12} className="text-gray-500 shrink-0" />
                            <span className="flex-1 text-gray-300 truncate">{eq.nameUa ?? eq.name}</span>
                            <span className={cn("font-medium shrink-0", STATUS_COLOR[eq.status] ?? "text-gray-400")}>{STATUS_UA[eq.status] ?? eq.status}</span>
                            <div className="w-16 shrink-0"><WearBar value={eq.wearAndTear} /></div>
                            {eq.isBroken ? (
                              <button
                                onClick={() => doEquipAction(eq.id, "repair")}
                                disabled={busy}
                                className="shrink-0 text-xs px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={10} className="animate-spin" /> : `Рем. ₴${(maintCost * 2 / 1000).toFixed(0)}K`}
                              </button>
                            ) : (eq.status === "WORN" || eq.wearAndTear > 0.3) ? (
                              <button
                                onClick={() => doEquipAction(eq.id, "maintenance")}
                                disabled={busy}
                                className="shrink-0 text-xs px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={10} className="animate-spin" /> : `ТО ₴${(maintCost / 1000).toFixed(0)}K`}
                              </button>
                            ) : (
                              <span className="text-gray-600 text-xs w-16 text-right shrink-0">{formatUAH(eq.marketValueUah)}</span>
                            )}
                          </div>
                          {msg && (
                            <div className={cn("px-3 py-1.5 text-xs font-medium", msg.ok ? "bg-emerald-950/60 text-emerald-400" : "bg-red-950/60 text-red-400")}>
                              {msg.text}
                            </div>
                          )}
                        </div>
                      );
                  })}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Agro Tourism panel (farm-level, below all workshop cards) */}
      {enterprise.type === "AGRO_FARM" && agroInfo && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white">🏡 Агротуризм</p>
              <p className="text-xs text-gray-500 mt-0.5">Пасивний дохід від ферми</p>
            </div>
            <div className="flex items-center gap-2">
              {agroInfo.agroTourismEnabled && (
                <span className="text-xs text-emerald-400 font-mono">+₴{(agroInfo.agroTourismRevenuePerTick ?? 0).toLocaleString('uk-UA')}/тік</span>
              )}
              <button
                onClick={() => toggleTourism(!(agroInfo.agroTourismEnabled))}
                disabled={tourismBusy}
                className={cn("text-xs rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-40",
                  agroInfo.agroTourismEnabled
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                    : "bg-emerald-700 hover:bg-emerald-600 text-white"
                )}>
                {tourismBusy ? <Loader2 size={10} className="animate-spin" /> : agroInfo.agroTourismEnabled ? "Вимкнути" : "Увімкнути"}
              </button>
            </div>
          </div>
          {!agroInfo.agroTourismEnabled && (
            <p className="text-xs text-gray-600 mt-1.5">Потрібен ґрунт ≥ 6. З Organic Cert +30% доходу.</p>
          )}
        </div>
      )}

      {/* Insurance Panel */}
      {enterprise.type === 'AGRO_FARM' && (() => {
        const hasInsurance = enterprise.licenses?.some(l => l.type === 'AGRO_INSURANCE' && l.status === 'ACTIVE');
        return (
          <div className="rounded border border-gray-700/50 bg-gray-900/60 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-300">🛡 Агрострахування</p>
              {hasInsurance
                ? <span className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded px-1.5 py-0.5">✓ Активне</span>
                : <span className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-1.5 py-0.5">✗ Немає</span>
              }
            </div>
            {hasInsurance ? (
              <p className="text-xs text-gray-500">Захист від посухи, хвороб і погодних катастроф. Виплата 35% вартості врожаю при збитках.</p>
            ) : (
              <>
                <p className="text-xs text-gray-500">₴5,000 · Захист від посухи, хвороб і погоди · виплата 35% при катастрофі</p>
                <button
                  onClick={buyInsurance}
                  disabled={insuranceBusy}
                  className="w-full text-xs rounded bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-800/40 px-2 py-1 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {insuranceBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '🛡'}
                  Купити страхування · ₴5,000
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Soil Analysis Modal */}
      {soilAnalysisData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSoilAnalysisData(null)}>
          <div className="rounded-xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">🔬 Аналіз ґрунту</h3>
              <button onClick={() => setSoilAnalysisData(null)} aria-label="Закрити" className="text-gray-500 hover:text-white text-xs">✕</button>
            </div>

            <div className="space-y-1.5">
              {[
                { label: 'N Азот',   val: soilAnalysisData.npk.nitrogen.level,   color: 'bg-blue-500'   },
                { label: 'P Фосфор', val: soilAnalysisData.npk.phosphorus.level, color: 'bg-orange-500' },
                { label: 'K Калій',  val: soilAnalysisData.npk.potassium.level,  color: 'bg-purple-500' },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-gray-400 shrink-0">{label}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-700">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
                  </div>
                  <span className={`text-xs font-mono w-10 text-right shrink-0 ${val < 40 ? 'text-red-400' : val < 60 ? 'text-amber-400' : 'text-emerald-400'}`}>{val.toFixed(0)}%</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-16 text-gray-400 shrink-0">💧 Волога</span>
                <div className="flex-1 h-2 rounded-full bg-gray-700">
                  <div className={`h-full rounded-full ${soilAnalysisData.moisture.level < 30 ? 'bg-red-500' : soilAnalysisData.moisture.level > 80 ? 'bg-blue-300' : 'bg-blue-500'}`} style={{ width: `${soilAnalysisData.moisture.level}%` }} />
                </div>
                <span className="text-xs font-mono w-10 text-right shrink-0 text-blue-400">{soilAnalysisData.moisture.level.toFixed(0)}%</span>
              </div>
            </div>

            <div className="text-xs text-gray-400">
              <span>Зерно: </span>
              <span className={soilAnalysisData.grain.qualityClass === 1 ? 'text-amber-300' : soilAnalysisData.grain.qualityClass === 3 ? 'text-red-400' : 'text-gray-300'}>
                {soilAnalysisData.grain.qualityLabel}
              </span>
              <span className="text-gray-500"> · вологість {soilAnalysisData.grain.moisturePct.toFixed(1)}%</span>
            </div>

            <div className="text-xs text-gray-300">
              Ефективність врожаю: <span className={`font-mono ${soilAnalysisData.estimatedYieldEfficiency >= 1.1 ? 'text-emerald-400' : soilAnalysisData.estimatedYieldEfficiency >= 0.8 ? 'text-amber-400' : 'text-red-400'}`}>{(soilAnalysisData.estimatedYieldEfficiency * 100).toFixed(0)}%</span>
            </div>

            {soilAnalysisData.warnings.length > 0 && (
              <div className="space-y-0.5">
                {soilAnalysisData.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-400">{w}</p>
                ))}
              </div>
            )}

            {soilAnalysisData.suggestions.length > 0 && (
              <div className="space-y-0.5 border-t border-gray-700/50 pt-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Рекомендації</p>
                {soilAnalysisData.suggestions.map((s, i) => (
                  <p key={i} className="text-xs text-blue-300">💡 {s}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {recipeModal && (
        <RecipeModal
          workshop={recipeModal}
          enterpriseType={enterprise.type}
          onAssigned={() => { setRecipeModal(null); onRefresh(); }}
          onClose={() => setRecipeModal(null)}
        />
      )}
      {buyEquipWs && (
        <BuyEquipmentModal
          workshopId={buyEquipWs.id}
          workshopName={buyEquipWs.name}
          onBought={() => { setBuyEquipWs(null); onRefresh(); }}
          onClose={() => setBuyEquipWs(null)}
        />
      )}
      {addModal && (
        <AddWorkshopModal
          enterprise={enterprise}
          onAdded={() => { setAddModal(false); onRefresh(); }}
          onClose={() => setAddModal(false)}
        />
      )}
    </div>
  );
}
