"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  SKU_EMOJI, RecipeModal, AGRO_SEASON_MULTS_UI, ROTATION_NEXT_UI, FIELD_CROPS_UI,
} from "@/components/game/EnterpriseDetailClient";
import type { EnterpriseData, AgroInfo, Workshop } from "@/components/game/EnterpriseDetailClient";

function CreateFieldPlot({ enterpriseId, enterpriseType, freeLandM2, onCreated }: {
  enterpriseId: string; enterpriseType: string; freeLandM2?: number; onCreated: () => void;
}) {
  const [recipes, setRecipes]   = useState<{ id: string; name: string; outputs: { product: { sku: string; nameUa: string } }[] }[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [areaM2, setAreaM2]     = useState("500");
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/recipes?type=${enterpriseType}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.recipes ?? [];
        setRecipes(list);
        if (list.length > 0) setRecipeId(list[0].id);
      }).catch(() => {});
  }, [enterpriseType]);

  const cost  = Math.round(parseFloat(areaM2 || "0") * 2500);
  const ticks = enterpriseType === "AGRO_FARM" ? 0 : Math.max(2, Math.ceil(parseFloat(areaM2 || "0") / 50));
  const selectedRecipe = recipes.find(r => r.id === recipeId);

  const handleCreate = async () => {
    if (!recipeId || !areaM2) return;
    setLoading(true); setMsg(null);
    const r = await fetch(`/api/enterprises/${enterpriseId}/expand`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, areaM2: parseFloat(areaM2) }),
    });
    const d = await r.json();
    if (r.ok) { setMsg(`✓ ${d.message}`); onCreated(); }
    else setMsg(`✗ ${d.error}`);
    setLoading(false);
  };

  return (
    <div className="rounded-lg border border-dashed border-green-800/60 bg-green-950/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">🌱</span>
        <div>
          <p className="text-sm font-semibold text-green-400">
            {freeLandM2 != null && freeLandM2 > 0 ? `Додати ділянку (вільно ${freeLandM2.toLocaleString()} м²)` : "Немає жодної ділянки для посіву"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Ділянка займе частину поля і буде вирощувати обрану культуру щотіку.</p>
        </div>
      </div>

      {recipes.length === 0 ? (
        <p className="text-xs text-gray-600">Завантаження рецептів...</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Що вирощувати</label>
              <select value={recipeId} onChange={e => setRecipeId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-green-500">
                {recipes.map(r => {
                  const out = r.outputs[0];
                  return <option key={r.id} value={r.id}>{out ? `${SKU_EMOJI[out.product.sku] ?? "🌿"} ${out.product.nameUa}` : r.name}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Площа ділянки (м²)</label>
              <input type="number" min="100" step="100"
                max={freeLandM2 != null ? freeLandM2 : undefined}
                value={areaM2} onChange={e => setAreaM2(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <div className="flex flex-col justify-end pb-0.5 gap-0.5">
              <p className="text-xs text-gray-500">Вартість: <span className="text-white font-mono">₴{cost.toLocaleString()}</span></p>
              {ticks > 0
                ? <p className="text-xs text-gray-500">Будівництво: <span className="text-white">{ticks} тік{ticks === 1 ? "" : "и"}</span></p>
                : <p className="text-xs text-emerald-500">⚡ Готова миттєво</p>
              }
            </div>
          </div>
          {selectedRecipe && (
            <p className="text-xs text-emerald-500">
              {SKU_EMOJI[selectedRecipe.outputs[0]?.product.sku ?? ""] ?? "🌿"} {ticks > 0 ? "Після будівництва ділянка" : "Ділянка одразу"} засіватиметься {selectedRecipe.outputs[0]?.product.nameUa ?? ""}
            </p>
          )}
          <button onClick={handleCreate} disabled={loading || !recipeId || !areaM2}
            className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded font-medium">
            {loading ? "Створення..." : `🌱 Створити ділянку ${areaM2 ? `(${parseFloat(areaM2).toLocaleString()} м²)` : ""}`}
          </button>
          {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

export default function FieldsTab({ enterprise, agroInfo, onRefresh }: { enterprise: EnterpriseData; agroInfo: AgroInfo | null; onRefresh: () => void }) {
  const season   = agroInfo?.seasonIndex ?? 0;
  const lastCrop = agroInfo?.lastCropSku ?? null;

  const [fieldInfo, setFieldInfo] = useState<{
    baseLandAreaM2: number; extraFieldAreaM2: number; totalFieldAreaM2: number;
    monthlyRentUah: number; soilQuality: number; setupCostPerM2: number; rentPerM2PerMonth: number;
  } | null>(null);
  const [expandArea, setExpandArea] = useState("");
  const [expanding, setExpanding] = useState(false);
  const [expandMsg, setExpandMsg] = useState<string | null>(null);
  const [contracts, setContracts] = useState<{
    id: string; productSku: string; productNameUa: string; productUnit: string;
    quantityUnits: number; pricePerUnit: number; totalValue: number;
    deliveryTick: number; createdAtTick: number; status: string;
  }[]>([]);
  const [newContract, setNewContract] = useState({ productSku: "", qty: "", price: "", days: "30" });
  const [contractMsg, setContractMsg] = useState<string | null>(null);
  const [submittingContract, setSubmittingContract] = useState(false);

  // Агро-ярмарок
  const [fairInfo, setFairInfo] = useState<{
    isFairDay: boolean; nextFairIn: number; fairPremium: number; currentTick: number;
    grainStock: { sku: string; nameUa: string; unit: string; quantity: number; quality: number; refPrice: number; fairPrice: number }[];
  } | null>(null);
  const [fairSku, setFairSku] = useState("");
  const [fairQty, setFairQty] = useState("");
  const [fairMsg, setFairMsg] = useState<string | null>(null);
  const [sellingFair, setSellingFair] = useState(false);

  // Добрива / шкідники / збір врожаю
  const [fertBusy,     setFertBusy]     = useState(false);
  const [pestBusy,     setPestBusy]     = useState(false);
  const [harvestBusy,  setHarvestBusy]  = useState<string | null>(null);
  const [agroActionMsg, setAgroActionMsg] = useState<string | null>(null);

  async function applyFertilizer() {
    setFertBusy(true); setAgroActionMsg(null);
    const res = await fetch("/api/agro/fertilize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId: enterprise.id }),
    });
    const d = await res.json();
    setFertBusy(false);
    setAgroActionMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
  }

  async function applyPesticide() {
    setPestBusy(true); setAgroActionMsg(null);
    const res = await fetch("/api/agro/pesticide", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId: enterprise.id }),
    });
    const d = await res.json();
    setPestBusy(false);
    setAgroActionMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
  }

  async function harvestWorkshop(workshopId: string) {
    setHarvestBusy(workshopId); setAgroActionMsg(null);
    const res = await fetch("/api/agro/harvest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workshopId }),
    });
    const d = await res.json();
    setHarvestBusy(null);
    setAgroActionMsg(res.ok ? `✓ Зібрано ${d.harvested?.toFixed(1)} кг → склад` : `✗ ${d.error}`);
    if (res.ok) onRefresh();
  }

  // Аграрний кредит
  const [loanContractId, setLoanContractId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanMonths, setLoanMonths] = useState("6");
  const [loanMsg, setLoanMsg] = useState<string | null>(null);
  const [takingLoan, setTakingLoan] = useState(false);

  // Виконані контракти
  const [historyContracts, setHistoryContracts] = useState<{
    id: string; productSku: string; productNameUa: string; productUnit: string;
    quantityUnits: number; pricePerUnit: number; totalValue: number;
    deliveryTick: number; createdAtTick: number; status: string;
  }[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const CROP_BASE_PRICE: Record<string, number> = {
    'RM-WHEAT': 8.5, 'RM-CORN': 7.0, 'RM-SUNFL': 14.0, 'RM-SUGBEET': 2.5,
  };

  const AGRO_SKUS = ["RM-WHEAT", "RM-SUNFL", "RM-CORN", "RM-SUGBEET", "SF-MILK", "FG-EGGS"];
  const [recipeModal, setRecipeModal] = useState<Workshop | null>(null);
  const [showAddPlot, setShowAddPlot] = useState(false);

  const hasSilo = enterprise.workshops.some(w =>
    w.equipment.some(eq => eq.name.includes("Силос") || eq.name.includes("Grain Silo"))
  );

  const refreshContracts = () => {
    fetch(`/api/agro/forward-contracts`)
      .then(r => r.ok ? r.json() : [])
      .then((all: { enterpriseName?: string; id: string; productSku: string; productNameUa: string; productUnit: string; quantityUnits: number; pricePerUnit: number; totalValue: number; deliveryTick: number; createdAtTick: number; status: string }[]) =>
        setContracts(all.filter((c) => c.status === "ACTIVE"))
      ).catch(() => {});
  };

  useEffect(() => {
    fetch(`/api/agro/expand-field?enterpriseId=${enterprise.id}`)
      .then(r => r.ok ? r.json() : null).then(setFieldInfo).catch(() => {});
    refreshContracts();
    fetch(`/api/agro/fair?enterpriseId=${enterprise.id}`)
      .then(r => r.ok ? r.json() : null).then(setFairInfo).catch(() => {});
  }, [enterprise.id]);

  useEffect(() => {
    if (!showHistory) return;
    fetch(`/api/agro/forward-contracts?enterpriseId=${enterprise.id}&status=FULFILLED`)
      .then(r => r.ok ? r.json() : [])
      .then((all: { enterpriseName?: string; id: string; productSku: string; productNameUa: string; productUnit: string; quantityUnits: number; pricePerUnit: number; totalValue: number; deliveryTick: number; createdAtTick: number; status: string }[]) => {
        const fulfilled = all.filter((c) => c.status === "FULFILLED" || c.status === "CANCELLED");
        setHistoryContracts(fulfilled.slice(0, 5));
      }).catch(() => {});
  }, [showHistory, enterprise.id]);

  const handleExpand = async () => {
    const area = parseFloat(expandArea);
    if (!area || area <= 0) return;
    setExpanding(true);
    setExpandMsg(null);
    try {
      const r = await fetch("/api/agro/expand-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterpriseId: enterprise.id, extraAreaM2: area }),
      });
      const data = await r.json();
      if (r.ok) {
        setExpandMsg(`✓ ${data.message}`);
        setExpandArea("");
        fetch(`/api/agro/expand-field?enterpriseId=${enterprise.id}`)
          .then(r => r.ok ? r.json() : null).then(setFieldInfo).catch(() => {});
      } else setExpandMsg(`✗ ${data.error}`);
    } finally { setExpanding(false); }
  };

  const handleCreateContract = async () => {
    if (!newContract.productSku || !newContract.qty || !newContract.price) return;
    setSubmittingContract(true);
    setContractMsg(null);
    try {
      const r = await fetch("/api/agro/forward-contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enterpriseId: enterprise.id,
          productSku:   newContract.productSku,
          quantityUnits: parseFloat(newContract.qty),
          pricePerUnit:  parseFloat(newContract.price),
          deliveryInTicks: parseInt(newContract.days),
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setContractMsg(`✓ ${data.message}`);
        setNewContract({ productSku: "", qty: "", price: "", days: "30" });
        refreshContracts();
      } else setContractMsg(`✗ ${data.error}`);
    } finally { setSubmittingContract(false); }
  };

  const handleCancelContract = async (id: string) => {
    if (!confirm("Скасувати ф'ючерс? Буде нараховано штраф 5%.")) return;
    const r = await fetch(`/api/agro/forward-contracts/${id}`, { method: "DELETE" });
    const data = await r.json();
    setContractMsg(r.ok ? `✓ ${data.message}` : `✗ ${data.error}`);
    setContracts(prev => prev.filter(c => c.id !== id));
  };

  const handleFairSell = async () => {
    if (!fairSku || !fairQty) return;
    setSellingFair(true);
    setFairMsg(null);
    try {
      const r = await fetch("/api/agro/fair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterpriseId: enterprise.id, sku: fairSku, quantity: parseFloat(fairQty) }),
      });
      const data = await r.json();
      if (r.ok) {
        setFairMsg(`✓ ${data.message}`);
        setFairQty("");
        fetch(`/api/agro/fair?enterpriseId=${enterprise.id}`)
          .then(res => res.ok ? res.json() : null).then(setFairInfo).catch(() => {});
      } else setFairMsg(`✗ ${data.error}`);
    } finally { setSellingFair(false); }
  };

  const handleTakeLoan = async () => {
    if (!loanContractId || !loanAmount || !loanMonths) return;
    setTakingLoan(true);
    setLoanMsg(null);
    try {
      const r = await fetch("/api/agro/loan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forwardContractId: loanContractId,
          principalUah: parseFloat(loanAmount),
          termMonths: parseInt(loanMonths),
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setLoanMsg(`✓ ${data.message}`);
        setLoanAmount("");
        setLoanContractId("");
      } else setLoanMsg(`✗ ${data.error}`);
    } finally { setTakingLoan(false); }
  };

  return (
    <div className="space-y-4 p-1">
      {agroInfo && (
        <div className="text-xs text-gray-500">
          Якість ґрунту <span className="font-mono text-white">{agroInfo.soilQuality.toFixed(1)}/10</span>
          {" · "}Сезон: <span className="text-white">{agroInfo.currentSeason}</span>
          {" · "}Остання культура: <span className="font-mono text-white">{agroInfo.lastCropSku ?? "—"}</span>
          {enterprise.localWeatherMod != null && enterprise.localWeatherMod < 1.0 && (
            <span className="ml-2 text-amber-400">⛈ {enterprise.localWeatherDesc ?? "Погодна подія"} ({Math.round(enterprise.localWeatherMod * 100)}%)</span>
          )}
        </div>
      )}

      {/* Панель стану ґрунту — добриво та шкідники */}
      {agroInfo && (
        <div className="flex flex-wrap gap-2 items-center">
          {agroInfo.pestDamageMult < 1.0 && (
            <div className="flex items-center gap-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2 text-xs text-red-300">
              <span>🐛 Шкідники −{Math.round((1 - agroInfo.pestDamageMult) * 100)}% врожаю</span>
              <button
                onClick={applyPesticide} disabled={pestBusy}
                className="ml-1 px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium disabled:opacity-50"
              >
                {pestBusy ? "..." : "Пестицид (5 кг)"}
              </button>
            </div>
          )}
          <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs border",
            agroInfo.fertilizerTicksLeft > 0
              ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-300"
              : "bg-gray-900 border-gray-800 text-gray-500")}>
            {agroInfo.fertilizerTicksLeft > 0
              ? <span>🌱 Добриво: ще {Math.ceil(agroInfo.fertilizerTicksLeft / 30)} сезони (+20%)</span>
              : <span>Добриво не внесено</span>}
            <button
              onClick={applyFertilizer} disabled={fertBusy}
              className="ml-1 px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium disabled:opacity-50"
            >
              {fertBusy ? "..." : "Внести (50 кг)"}
            </button>
          </div>
          {agroActionMsg && (
            <p className={cn("text-xs", agroActionMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400")}>{agroActionMsg}</p>
          )}
        </div>
      )}

      {/* Ділянки — що засівати (ПЕРШОЧЕРГОВО) */}
      {(() => {
        const totalLandM2 = fieldInfo ? fieldInfo.baseLandAreaM2 + fieldInfo.extraFieldAreaM2 : null;
        const usedM2 = enterprise.workshops.reduce((s, w) => s + w.footprintM2, 0);
        const freeLandM2 = totalLandM2 != null ? totalLandM2 - usedM2 : null;
        const canAddPlot = freeLandM2 != null && freeLandM2 >= 100;
        return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ділянки — що засівати</p>
            {totalLandM2 != null && (
              <p className="text-xs text-gray-600 mt-0.5">
                Використано <span className="text-white">{usedM2.toLocaleString()} м²</span>
                {" з "}
                <span className="text-white">{totalLandM2.toLocaleString()} м²</span>
                {freeLandM2 != null && freeLandM2 > 0 && (
                  <span className="text-emerald-500"> · вільно {freeLandM2.toLocaleString()} м²</span>
                )}
              </p>
            )}
          </div>
          {canAddPlot && enterprise.workshops.length > 0 && (
            <button onClick={() => setShowAddPlot(v => !v)}
              className={cn("text-xs px-2.5 py-1 rounded border transition-colors",
                showAddPlot
                  ? "border-gray-600 bg-gray-800 text-gray-300"
                  : "border-green-700 bg-green-900/40 text-green-400 hover:bg-green-800/50")}>
              {showAddPlot ? "✕ Скасувати" : "+ Нова ділянка"}
            </button>
          )}
        </div>

        {(enterprise.workshops.length === 0 || showAddPlot) && (
          <CreateFieldPlot
            enterpriseId={enterprise.id}
            enterpriseType={enterprise.type}
            freeLandM2={freeLandM2 ?? undefined}
            onCreated={() => { setShowAddPlot(false); onRefresh(); }}
          />
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {enterprise.workshops.map((ws) => {
            const order    = ws.productionOrders[0] ?? null;
            const cropSku  = order?.recipe?.outputs?.[0]?.product?.sku ?? null;
            const cropName = order?.recipe?.outputs?.[0]?.product?.nameUa ?? null;
            const cropUnit = order?.recipe?.outputs?.[0]?.product?.unit ?? null;
            const emoji    = cropSku ? (SKU_EMOJI[cropSku] ?? "🌿") : null;
            const seasonMult = cropSku ? (AGRO_SEASON_MULTS_UI[cropSku]?.[season] ?? 1.0) : null;

            let rotationStatus: 'optimal' | 'mono' | 'neutral' | null = null;
            const nextRecommended = lastCrop ? ROTATION_NEXT_UI[lastCrop] : null;
            if (cropSku && FIELD_CROPS_UI.has(cropSku)) {
              if (lastCrop === cropSku) rotationStatus = 'mono';
              else if (lastCrop && ROTATION_NEXT_UI[lastCrop] === cropSku) rotationStatus = 'optimal';
              else if (lastCrop) rotationStatus = 'neutral';
            }

            const borderCls = cropSku
              ? rotationStatus === 'optimal' ? 'border-emerald-700/50' : rotationStatus === 'mono' ? 'border-red-800/50' : 'border-gray-800'
              : 'border-dashed border-gray-700';

            const soilMult  = agroInfo ? agroInfo.soilQuality / 7.0 : 1.0;
            const rotMult   = rotationStatus === 'optimal' ? 1.15 : rotationStatus === 'mono' ? 0.85 : 1.0;
            const estYield  = cropSku && seasonMult !== null
              ? Math.min(ws.footprintM2 * soilMult * seasonMult * rotMult, ws.currentVolume > 0 ? ws.currentVolume : Infinity)
              : null;

            return (
              <div key={ws.id} className={cn("rounded-lg border bg-gray-900 p-3 space-y-2", borderCls)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-white leading-tight">{ws.name}</p>
                  <span className="shrink-0 text-xs text-gray-500 font-mono">{ws.footprintM2.toLocaleString()} м²</span>
                </div>
                {cropSku ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{cropName}</p>
                        <p className="text-xs text-gray-500 font-mono">{cropSku}</p>
                      </div>
                    </div>
                    {seasonMult !== null && (
                      <div className={cn("flex items-center gap-1.5 text-xs rounded px-2 py-1",
                        seasonMult === 0 ? "bg-red-950/40 text-red-400" : seasonMult >= 0.8 ? "bg-emerald-950/40 text-emerald-400" : "bg-amber-950/40 text-amber-400")}>
                        <span>{seasonMult === 0 ? "❌" : seasonMult >= 0.8 ? "✓" : "⚠"}</span>
                        <span>Сезон: <strong>{Math.round(seasonMult * 100)}%</strong></span>
                        {seasonMult === 0 && <span className="ml-1 opacity-70">— позасезонно, без врожаю</span>}
                      </div>
                    )}
                    {rotationStatus === 'optimal' && <p className="text-xs text-emerald-400">✓ Оптимальна ротація +15%</p>}
                    {rotationStatus === 'mono' && nextRecommended && (
                      <p className="text-xs text-red-400">✗ Монокультура −15% · краще: {SKU_EMOJI[nextRecommended] ?? ""} {nextRecommended}</p>
                    )}
                    {rotationStatus === 'neutral' && nextRecommended && (
                      <p className="text-xs text-gray-500">Рекомендовано: {SKU_EMOJI[nextRecommended] ?? ""} {nextRecommended}</p>
                    )}
                    {estYield !== null && (
                      <div className="mt-1 border-t border-gray-800 pt-1.5">
                        {estYield === 0 || seasonMult === 0 ? (
                          <p className="text-xs text-red-400">Врожай: 0 — позасезонно</p>
                        ) : (
                          <p className="text-xs text-gray-400">
                            Врожай ~<span className="text-white font-mono">{estYield.toFixed(1)}</span>
                            {cropUnit ? ` ${cropUnit}` : ""}/тік
                            <span className="text-gray-600 ml-1">({ws.footprintM2} м² · ґрунт {(soilMult * 100).toFixed(0)}%)</span>
                          </p>
                        )}
                      </div>
                    )}
                    {ws.harvestAccumulated >= 0.1 && FIELD_CROPS_UI.has(cropSku ?? '') && (
                      <div className="mt-1.5 border-t border-amber-900/40 pt-1.5 flex items-center justify-between">
                        <p className="text-xs text-amber-300">
                          🌾 Готово до збору: <span className="font-mono font-bold">{ws.harvestAccumulated.toFixed(1)}</span> {cropUnit ?? "кг"}
                        </p>
                        <button
                          onClick={() => harvestWorkshop(ws.id)}
                          disabled={harvestBusy === ws.id}
                          className="px-2 py-0.5 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50"
                        >
                          {harvestBusy === ws.id ? "..." : "Зібрати →"}
                        </button>
                      </div>
                    )}
                    <button onClick={() => setRecipeModal(ws)} className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                      Змінити культуру
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Ділянка порожня — оберіть, що посіяти</p>
                    {nextRecommended && (
                      <p className="text-xs text-emerald-500">Рекомендовано: {SKU_EMOJI[nextRecommended] ?? ""} {nextRecommended}</p>
                    )}
                    <button onClick={() => setRecipeModal(ws)} className="w-full py-1.5 bg-green-800 hover:bg-green-700 text-white text-xs rounded font-medium">
                      🌱 Засіяти ділянку
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
        );
      })()}

      {/* Площа поля + оренда */}
      {fieldInfo && (
        <div className="rounded-lg border border-green-900/40 bg-green-950/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-green-400">Площа поля</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-gray-500">Базова</span><p className="text-white font-mono">{fieldInfo.baseLandAreaM2.toLocaleString()} м²</p></div>
            <div><span className="text-gray-500">Орендована</span><p className="text-emerald-400 font-mono">+{fieldInfo.extraFieldAreaM2.toLocaleString()} м²</p></div>
            <div><span className="text-gray-500">Оренда/міс</span><p className="text-orange-400 font-mono">₴{fieldInfo.monthlyRentUah.toLocaleString()}</p></div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Додати поле (м²) · ₴{fieldInfo.setupCostPerM2}/м² разово + ₴{fieldInfo.rentPerM2PerMonth}/м²/міс</label>
              <input type="number" min="100" max="200000" step="100" value={expandArea} onChange={e => setExpandArea(e.target.value)}
                placeholder="напр. 10000"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <button onClick={handleExpand} disabled={expanding || !expandArea}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded">
              {expanding ? "..." : "Орендувати"}
            </button>
          </div>
          {expandMsg && <p className={`text-xs ${expandMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{expandMsg}</p>}
        </div>
      )}
      {/* Ф'ючерсні контракти */}
      <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-3 space-y-3">
        <p className="text-xs font-semibold text-amber-400 flex items-center gap-1">
          Ф&apos;ючерси (фіксована ціна продажу)
          <InfoTooltip text="Контракт на продаж майбутнього врожаю за фіксованою ціною наперед. Якщо на момент постачання товару не вистачить — штраф 5% від суми угоди. Можна використати як заставу для агрокредиту." />
        </p>

        {/* Активні контракти */}
        {contracts.length > 0 ? (
          <div className="space-y-2">
            {contracts.map(c => {
              const basePrice = CROP_BASE_PRICE[c.productSku] ?? 0;
              const pnlPct = basePrice > 0 ? ((c.pricePerUnit - basePrice) / basePrice * 100) : null;
              const isGoodPrice = pnlPct !== null && pnlPct >= 0;
              const accumulated = enterprise.workshops[0]?.harvestAccumulated ?? 0;
              const fillPct = c.quantityUnits > 0 ? Math.min(100, (accumulated / c.quantityUnits) * 100) : 0;
              const isFulfilled = fillPct >= 100;
              const isWarning = fillPct >= 20 && fillPct < 50;
              const isDanger = fillPct < 20;
              return (
                <div key={c.id} className="border border-gray-800 rounded p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono text-emerald-300">{c.productSku}</span>
                      <span className="text-gray-400 ml-2">{c.quantityUnits} {c.productUnit} × ₴{c.pricePerUnit}</span>
                      <span className="text-gray-600 ml-2">= ₴{c.totalValue.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">до дня {c.deliveryTick}</span>
                      <button onClick={() => handleCancelContract(c.id)} aria-label="Скасувати ф'ючерс" className="text-red-500 hover:text-red-400 text-xs">✕</button>
                    </div>
                  </div>
                  {/* PnL badge */}
                  {pnlPct !== null && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Контрактна: ₴{c.pricePerUnit}/кг · vs Ринок: ~₴{basePrice}/кг</span>
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${isGoodPrice ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                        {isGoodPrice ? `+${pnlPct.toFixed(1)}% вигода` : `${pnlPct.toFixed(1)}% збиток`}
                      </span>
                    </div>
                  )}
                  {/* Прогрес виконання */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Накопичено: {accumulated.toFixed(1)} / {c.quantityUnits} {c.productUnit}</span>
                      {isFulfilled
                        ? <span className="text-emerald-400 font-semibold">✓ Готово до доставки</span>
                        : isWarning
                          ? <span className="text-yellow-400">⚠ Накопичено {fillPct.toFixed(0)}%</span>
                          : isDanger
                            ? <span className="text-red-400">⚡ Ризик дефолту</span>
                            : <span className="text-gray-400">{fillPct.toFixed(0)}%</span>
                      }
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isFulfilled ? 'bg-emerald-500' : isWarning ? 'bg-yellow-500' : isDanger ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Немає активних ф&apos;ючерсів</p>
        )}

        {/* Виконані контракти */}
        <div className="border border-gray-800/60 rounded overflow-hidden">
          <button
            onClick={() => setShowHistory(h => !h)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/30 transition-colors"
          >
            <span>Виконані контракти</span>
            <span>{showHistory ? '▲' : '▼'}</span>
          </button>
          {showHistory && (
            <div className="p-2 space-y-1.5 border-t border-gray-800/60">
              {historyContracts.length === 0 ? (
                <p className="text-xs text-gray-600 py-1 text-center">Немає виконаних контрактів</p>
              ) : (
                historyContracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs border border-gray-800 rounded px-2 py-1.5">
                    <div>
                      <span className="font-mono text-gray-300">{c.productSku}</span>
                      <span className="text-gray-500 ml-2">{c.quantityUnits} {c.productUnit} × ₴{c.pricePerUnit}</span>
                      <span className="text-gray-600 ml-2">= ₴{c.totalValue.toLocaleString()}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${c.status === 'FULFILLED' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                      {c.status === 'FULFILLED' ? '✓ Виконано' : '✕ Скасовано'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Новий ф'ючерс */}
        <div className="grid grid-cols-2 gap-2">
          <select value={newContract.productSku} onChange={e => setNewContract(p => ({ ...p, productSku: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500">
            <option value="">Оберіть культуру</option>
            {AGRO_SKUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" placeholder="Кількість" value={newContract.qty} onChange={e => setNewContract(p => ({ ...p, qty: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500" />
          <div className="space-y-0.5">
            <input type="number" placeholder="Ціна ₴/од" value={newContract.price} onChange={e => setNewContract(p => ({ ...p, price: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500" />
            {newContract.productSku && newContract.price && (() => {
              const base = CROP_BASE_PRICE[newContract.productSku] ?? 0;
              const myPrice = parseFloat(newContract.price);
              if (!base || !myPrice) return null;
              const diff = ((myPrice - base) / base * 100).toFixed(1);
              const isGood = myPrice >= base;
              return (
                <p className={`text-xs ${isGood ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isGood ? `✓ Вище ринку на ${diff}%` : `⚠ Нижче ринку на ${Math.abs(parseFloat(diff))}%`}
                  {' '}(база ~₴{base}/кг)
                </p>
              );
            })()}
          </div>
          <select value={newContract.days} onChange={e => setNewContract(p => ({ ...p, days: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500">
            <option value="10">+10 днів</option>
            <option value="20">+20 днів</option>
            <option value="30">+30 днів</option>
            <option value="60">+60 днів</option>
          </select>
        </div>
        <button onClick={handleCreateContract} disabled={submittingContract || !newContract.productSku || !newContract.qty || !newContract.price}
          className="w-full py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs rounded">
          {submittingContract ? "..." : "Укласти ф'ючерс"}
        </button>
        {contractMsg && <p className={`text-xs ${contractMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{contractMsg}</p>}
      </div>

      {/* Силос */}
      {!hasSilo && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/10 p-3 flex items-start gap-2 text-xs">
          <span className="text-red-400 text-sm">⚠</span>
          <div>
            <p className="font-semibold text-red-400">Немає силосу (EQ-SILO)</p>
            <p className="text-gray-500 mt-0.5">Зерно втрачає якість −0.05/день. Купіть EQ-SILO на ринку та встановіть у цеху, щоб зупинити деградацію.</p>
          </div>
        </div>
      )}
      {hasSilo && (
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-2 flex items-center gap-2 text-xs text-emerald-400">
          <span>✓</span><span>Силос встановлено — якість зерна не деградує</span>
        </div>
      )}

      {/* Агро-ярмарок */}
      {fairInfo && (
        <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-yellow-400">Агро-ярмарок (+{Math.round((fairInfo.fairPremium - 1) * 100)}%)</p>
            {fairInfo.isFairDay ? (
              <span className="text-xs bg-yellow-700 text-yellow-100 px-2 py-0.5 rounded-full">Відкрито сьогодні!</span>
            ) : (
              <span className="text-xs text-gray-500">До ярмарку: {fairInfo.nextFairIn} дн.</span>
            )}
          </div>
          {fairInfo.grainStock.length === 0 ? (
            <p className="text-xs text-gray-600">Немає зерна для продажу на ярмарку</p>
          ) : fairInfo.isFairDay ? (
            <div className="space-y-2">
              <div className="space-y-1">
                {fairInfo.grainStock.map(g => (
                  <div key={g.sku} className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-mono text-emerald-300">{g.sku}</span>
                    <span>{g.quantity.toFixed(1)} {g.unit}</span>
                    <span className="text-yellow-300">₴{g.fairPrice}/од</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 items-end">
                <select value={fairSku} onChange={e => { setFairSku(e.target.value); setFairQty(""); }}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-500">
                  <option value="">Оберіть культуру</option>
                  {fairInfo.grainStock.map(g => <option key={g.sku} value={g.sku}>{g.sku} ({g.quantity.toFixed(1)} {g.unit})</option>)}
                </select>
                <input type="number" placeholder="Кількість" value={fairQty} onChange={e => setFairQty(e.target.value)}
                  className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500" />
                <button onClick={handleFairSell} disabled={sellingFair || !fairSku || !fairQty}
                  className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-xs rounded">
                  {sellingFair ? "..." : "Продати"}
                </button>
              </div>
              {fairMsg && <p className={`text-xs ${fairMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{fairMsg}</p>}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Ярмарок відбувається кожні 20 днів. Зберіть зерно до наступного.</p>
          )}
        </div>
      )}

      {/* Аграрний кредит */}
      {contracts.length > 0 && (
        <div className="rounded-lg border border-blue-900/40 bg-blue-950/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-400">Аграрний кредит (8% річних)</p>
          <p className="text-xs text-gray-500">Застава: активний ф&apos;ючерсний контракт. Сума до 70% вартості контракту.</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={loanContractId} onChange={e => setLoanContractId(e.target.value)}
              className="col-span-2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="">Оберіть контракт-заставу</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.productSku} × {c.quantityUnits} = ₴{c.totalValue.toLocaleString()} (макс. кредит ₴{Math.round(c.totalValue * 0.7).toLocaleString()})
                </option>
              ))}
            </select>
            <input type="number" placeholder="Сума ₴" value={loanAmount} onChange={e => setLoanAmount(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            <select value={loanMonths} onChange={e => setLoanMonths(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="1">1 місяць</option>
              <option value="3">3 місяці</option>
              <option value="6">6 місяців</option>
              <option value="12">12 місяців</option>
              <option value="24">24 місяці</option>
            </select>
          </div>
          <button onClick={handleTakeLoan} disabled={takingLoan || !loanContractId || !loanAmount}
            className="w-full py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded">
            {takingLoan ? "..." : "Взяти кредит"}
          </button>
          {loanMsg && <p className={`text-xs ${loanMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{loanMsg}</p>}
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
    </div>
  );
}
