"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Zap, Users, Package, Factory,
  AlertCircle, AlertTriangle, Wrench, Hammer, CheckCircle2,
  TrendingUp, TrendingDown, Cpu, Leaf, Plus, Trash2,
  BookOpen, SlidersHorizontal, Loader2, X, ChevronDown, Pencil, Truck,
} from "lucide-react";
import { cn, formatUAH, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// ─── Product emoji map ─────────────────────────────────────────────────────────

const SKU_EMOJI: Record<string, string> = {
  "RM-WHEAT":   "🌾", "RM-SUNFL":  "🌻", "RM-SUGBEET": "🫚",
  "RM-MILK":    "🐄", "RM-CORN":   "🌽", "RM-IRONORE": "🪨",
  "RM-COAL":    "⚫", "RM-LUMBER": "🪵",
  "SF-FLOUR":   "🌾", "SF-SUGAR":  "🍬", "SF-STEEL":   "🔩",
  "SF-PLANKS":  "🪵",
  "FG-BREAD":   "🍞", "FG-MILK":   "🥛", "FG-PASTA":   "🍝",
  "FG-SUNOIL":  "🫙", "FG-STEEL-P":"🔧", "FG-FURN":    "🪑",
  "CM-BRICK":   "🧱", "CM-SAND":   "🏖️", "CM-GRAVEL":  "🪨",
  "CM-CONCRETE":"🏗️", "CM-CEMENT": "🏗️", "CM-REBAR":   "🔗",
  "CM-TIMBER":  "🪵",
  "EQ-MILLGRIND":"⚙️","EQ-OILPRESS":"⚙️","EQ-FURNACE": "🔥",
  "EQ-TRACTOR": "🚜", "EQ-SAWMILL":"🪚", "EQ-DAIRYLINE":"⚙️",
  // Торгове
  "EQ-CASHREGISTER":"🖥️","EQ-POSTERMINAL":"💳","EQ-SHELVING":"🗄️",
  "EQ-DISPLAYFRIDGE":"❄️","EQ-FREEZER":"🧊","EQ-CCTV":"📷",
  "EQ-SCALE":"⚖️","EQ-PRICETAG":"🏷️","EQ-SELFCHECKOUT":"🤖","EQ-CONVEYOR":"🔄",
  // Office
  "EQ-DESK":"🪑","EQ-OFFCHAIR":"💺","EQ-COMPUTER":"🖥️","EQ-PRINTER":"🖨️",
  "EQ-PROJECTOR":"📽️","EQ-SERVER":"🗄️","EQ-PBXPHONE":"☎️",
  "EQ-AIRCON":"❄️","EQ-COFFEEMACH":"☕","EQ-OFFICESAFE":"🔒",
};

function productEmoji(sku: string): string {
  return SKU_EMOJI[sku] ?? "📦";
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EquipCatalogItem { id: string; name: string; sku: string; basePrice: number; unit: string; footprintM2: number; canBuy: boolean }

type Tab = "management" | "workshops" | "hr" | "warehouse" | "production" | "supply" | "showcase" | "fields" | "staff" | "expand";

interface Props { enterpriseId: string; initialTab?: Tab; title?: string }

interface Employee {
  id: string; firstName: string; lastName: string; profession: string;
  salaryUah: number; mood: number; efficiency: number;
  isOnStrike: boolean; hiredAt: string; accruedSalaryUah: number;
}

interface Equipment {
  id: string; name: string; status: string; wearAndTear: number;
  energyConsumptionKw: number; marketValueUah: number; isBroken: boolean;
  maintenanceCostUah: number;
}

interface ProductionOrder {
  id: string; targetQuantity: number; completedQuantity: number;
  outputQuality: number | null; ticksRemaining: number;
  recipe: { id: string; name: string; outputs: { product: { sku: string; nameUa: string } }[] } | null;
}

interface Workshop {
  id: string; name: string; footprintM2: number; maxCapacity: number;
  currentVolume: number; isActive: boolean;
  equipment: Equipment[];
  productionOrders: ProductionOrder[];
}

interface InventoryItem {
  quantity: number; quality: number;
  product: { id: string; sku: string; nameUa: string; unit: string };
}

interface FinancialLog {
  id: string; category: string; amountUah: number;
  description: string; recordedAt: string; tickNumber: string;
}

interface AgroInfo {
  soilQuality:        number;
  lastCropSku:        string | null;
  recommendedCropSku: string | null;
  currentSeason:      string;
  seasonIndex:        number;
  tickNumber:         number;
}

interface EnterpriseData {
  id: string; name: string; type: string;
  footprintM2: number; totalFloorAreaM2: number; usedFloorAreaM2: number;
  isOperational: boolean; isSeized: boolean; isFrozenByInspection: boolean;
  isLegallyFrozen: boolean; isCollateral: boolean;
  legalFreezeReason: string | null;
  energySourceType: string; solarCapacityKw: number;
  batteryCapacityKwh: number; currentBatteryKwh: number;
  constructedAt: string | null;
  landPlot: {
    monthlyLeaseCostUah: number; purchasePriceUah: number;
    energyTariffUah: number; status: string;
    city: { name: string; nameUa: string; region: string };
  };
  employees: Employee[];
  workshops: Workshop[];
  inventory: InventoryItem[];
}

interface RecipeOption {
  id: string; name: string;
  outputs: { quantityPerUnit: number; product: { sku: string; nameUa: string; unit: string } }[];
  inputs:  { quantityPerUnit: number; product: { sku: string; nameUa: string; unit: string } }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PROF_UA: Record<string, string> = {
  ACCOUNTANT: "Бухгалтер", MANAGER: "Менеджер", OPERATOR: "Оператор",
  ENGINEER: "Інженер", AGRONOMIST: "Агроном", LOADER: "Вантажник",
  DRIVER: "Водій", SECURITY_GUARD: "Охоронник", SECURITY_OFFICER: "Нач. охорони",
  CLEANER: "Прибиральник", SALES_REP: "Торг. представник",
  IT_SPECIALIST: "IT-спеціаліст", LAWYER: "Юрист", HR_SPECIALIST: "HR-спеціаліст",
  TECHNICIAN: "Технік", QUALITY_CONTROLLER: "Контролер якості",
  RESEARCHER: "Дослідник", DATA_SCIENTIST: "Data scientist",
  // Магазин
  CASHIER: "Касир", SALES_ASSISTANT: "Продавець-консультант", MERCHANDISER: "Мерчандайзер",
};

const PROF_SALARY: Record<string, number> = {
  ACCOUNTANT: 25000, MANAGER: 35000, OPERATOR: 18000, ENGINEER: 40000,
  AGRONOMIST: 22000, LOADER: 15000, DRIVER: 20000, SECURITY_GUARD: 15000,
  SECURITY_OFFICER: 30000, CLEANER: 12000, SALES_REP: 20000,
  IT_SPECIALIST: 50000, LAWYER: 45000, HR_SPECIALIST: 28000,
  TECHNICIAN: 22000, QUALITY_CONTROLLER: 25000, RESEARCHER: 35000, DATA_SCIENTIST: 60000,
  CASHIER: 16000, SALES_ASSISTANT: 18000, MERCHANDISER: 20000,
};

// Які професії доступні для кожного типу підприємства
const UNIVERSAL_PROFS  = ["MANAGER","ACCOUNTANT","HR_SPECIALIST","LAWYER","IT_SPECIALIST","SECURITY_GUARD","SECURITY_OFFICER","CLEANER","LOADER","DRIVER"];
const PRODUCTION_PROFS = ["OPERATOR","ENGINEER","TECHNICIAN","QUALITY_CONTROLLER","AGRONOMIST","SALES_REP"];
const RETAIL_PROFS     = ["CASHIER","SALES_ASSISTANT","MERCHANDISER","SALES_REP"];
const LAB_PROFS        = ["RESEARCHER","DATA_SCIENTIST"];

function professionsForType(enterpriseType: string): string[] {
  if (enterpriseType === "RETAIL_STORE") return [...UNIVERSAL_PROFS, ...RETAIL_PROFS];
  if (enterpriseType === "RD_LABORATORY") return [...UNIVERSAL_PROFS, ...PRODUCTION_PROFS, ...LAB_PROFS];
  return [...UNIVERSAL_PROFS, ...PRODUCTION_PROFS];
}

const STATUS_COLOR: Record<string, string> = {
  NEW: "text-blue-400", OPERATIONAL: "text-emerald-400",
  WORN: "text-amber-400", BROKEN: "text-red-400",
};

const STATUS_UA: Record<string, string> = {
  NEW: "Нове", OPERATIONAL: "Робоче", WORN: "Зношене", BROKEN: "Зламане",
};

function MoodBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

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

// ─── Hire Modal ────────────────────────────────────────────────────────────────

function HireModal({
  enterpriseId, enterpriseType, onHired, onClose,
}: { enterpriseId: string; enterpriseType: string; onHired: () => void; onClose: () => void }) {
  const professions = professionsForType(enterpriseType).map(k => [k, PROF_UA[k] ?? k] as [string, string]);
  const [profession, setProfession] = useState(professions[0][0]);
  const [salary, setSalary]         = useState(PROF_SALARY[professions[0][0]] ?? 20000);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState("");

  function handleProfChange(p: string) {
    setProfession(p);
    setSalary(PROF_SALARY[p] ?? 20000);
  }

  async function hire() {
    setSaving(true); setErr("");
    const res = await fetch(`/api/enterprises/${enterpriseId}/hire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profession, salaryUah: salary }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setSaving(false); return; }
    onHired();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Найняти співробітника</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Посада</label>
            <div className="relative mt-1">
              <select
                value={profession}
                onChange={e => handleProfChange(e.target.value)}
                className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white appearance-none focus:outline-none focus:border-emerald-500 pr-8"
              >
                {professions.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Зарплата / місяць</label>
              <span className="text-xs font-mono text-white">{formatUAH(salary)}</span>
            </div>
            <input
              type="range"
              min={8000} max={150000} step={1000}
              value={salary}
              onChange={e => setSalary(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>8 000 ₴</span>
              <span>150 000 ₴</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs space-y-1">
            <div className="flex justify-between text-gray-400">
              <span>ЄСВ 22% (роботодавець)</span>
              <span className="font-mono text-orange-400">+{formatUAH(salary * 0.22)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-white">Витрати / місяць</span>
              <span className="font-mono text-orange-300">{formatUAH(salary * 1.22)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={hire} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Найняти
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Workshop Add Modal ────────────────────────────────────────────────────────

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
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
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

// ─── Recipe Picker Modal ───────────────────────────────────────────────────────

function RecipeModal({
  workshop, enterpriseType, onAssigned, onClose,
}: { workshop: Workshop; enterpriseType: string; onAssigned: () => void; onClose: () => void }) {
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);
  const [err, setErr]         = useState("");

  useEffect(() => {
    fetch(`/api/recipes?type=${enterpriseType}`)
      .then(r => r.json())
      .then(d => setRecipes(d.recipes ?? []))
      .finally(() => setLoading(false));
  }, [enterpriseType]);

  async function assign(recipeId: string) {
    setSaving(recipeId); setErr("");
    const res = await fetch(`/api/workshops/${workshop.id}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, targetQuantity: 999_999 }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "Помилка"); setSaving(null); return; }
    onAssigned();
  }

  const currentRecipeId = workshop.productionOrders[0]?.recipe?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Обрати рецепт — {workshop.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 mx-5 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
          ) : recipes.length === 0 ? (
            <div className="py-12 text-center">
              <BookOpen size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Рецептів для цього типу підприємства немає</p>
            </div>
          ) : recipes.map(r => {
            const isCurrent = r.id === currentRecipeId;
            const mainOut   = r.outputs[0];
            return (
              <button
                key={r.id}
                onClick={() => !isCurrent && assign(r.id)}
                disabled={!!saving || isCurrent}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition-all",
                  isCurrent
                    ? "border-emerald-500/40 bg-emerald-500/8 cursor-default"
                    : "border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800",
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white">{r.name}</p>
                  {isCurrent ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Поточний</span>
                  ) : saving === r.id ? (
                    <Loader2 size={13} className="animate-spin text-emerald-400" />
                  ) : null}
                </div>
                {mainOut && (
                  <p className="text-xs text-emerald-400 mb-1.5">
                    → {mainOut.quantityPerUnit} {mainOut.product.unit} {mainOut.product.nameUa}
                  </p>
                )}
                {r.inputs.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Вхід: {r.inputs.map(i => `${productEmoji(i.product.sku)} ${i.quantityPerUnit} ${i.product.nameUa}`).join(" + ")}
                  </p>
                )}
                {mainOut && (
                  <span className="text-2xl leading-none mt-1 block">{productEmoji(mainOut.product.sku)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-800">
          <Button variant="outline" className="w-full" onClick={onClose}>Закрити</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

function ManagementTab({ enterprise, stats, productionLogs, onToggleOperational }: {
  enterprise: EnterpriseData;
  stats: { salaryPerTick: number; rentPerTick: number; avgEfficiency: number; avgMood: number };
  productionLogs: { tickNumber: string; unitsProduced: number; avgQuality: number }[];
  onToggleOperational: (val: boolean) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);
  const isActive = enterprise.isOperational && !enterprise.isSeized;
  const canToggle = !enterprise.isSeized && !enterprise.isFrozenByInspection && !enterprise.isLegallyFrozen;

  async function handleToggle() {
    setToggling(true);
    await onToggleOperational(!enterprise.isOperational);
    setToggling(false);
  }

  return (
    <div className="space-y-6">
      {(enterprise.isSeized || enterprise.isFrozenByInspection || enterprise.isLegallyFrozen) && (
        <div className="space-y-2">
          {enterprise.isSeized && <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm"><AlertCircle size={15} /> Підприємство вилучено</div>}
          {enterprise.isFrozenByInspection && <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm"><AlertTriangle size={15} /> Заморожено інспекцією</div>}
          {enterprise.isLegallyFrozen && <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm"><AlertTriangle size={15} /> Судовий арешт {enterprise.legalFreezeReason ? `— ${enterprise.legalFreezeReason}` : ""}</div>}
        </div>
      )}

      {canToggle && (
        <div className={cn("rounded-xl border p-4 flex items-center justify-between", enterprise.isOperational ? "border-emerald-800/40 bg-emerald-950/20" : "border-amber-800/40 bg-amber-950/20")}>
          <div>
            <p className="text-sm font-medium text-white">{enterprise.isOperational ? "Підприємство активне" : "Підприємство призупинено"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{enterprise.isOperational ? "Виробництво та облік енергії працюють" : "Виробництво та облік енергії зупинено"}</p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              enterprise.isOperational
                ? "bg-amber-900/60 text-amber-300 hover:bg-amber-800/60"
                : "bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800/60"
            )}
          >
            {toggling ? <Loader2 size={11} className="animate-spin" /> : null}
            {enterprise.isOperational ? "Призупинити" : "Запустити"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Місто",       value: enterprise.landPlot.city.nameUa },
          { label: "Регіон",      value: enterprise.landPlot.city.region },
          { label: "Площа забудови", value: `${enterprise.footprintM2.toLocaleString("uk")} м²` },
          { label: "Площа будівлі",  value: `${enterprise.totalFloorAreaM2.toLocaleString("uk")} м²` },
          { label: "Земельна ділянка", value: enterprise.landPlot.status === "OWNED" ? "Власна" : "Оренда" },
          { label: "Побудовано",  value: enterprise.constructedAt ? new Date(enterprise.constructedAt).toLocaleDateString("uk") : "—" },
          { label: "Тариф ел/е", value: `${Number(enterprise.landPlot.energyTariffUah).toFixed(2)} ₴/кВт·год` },
          { label: "Оренда/місяць", value: formatUAH(enterprise.landPlot.monthlyLeaseCostUah) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-sm text-white font-medium">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Витрати / тік</h3>
        <div className="space-y-2">
          {[
            { label: "ФОП (зарплата + ЄСВ 22%)", value: stats.salaryPerTick },
            { label: "Оренда землі",              value: stats.rentPerTick },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{label}</span>
              <span className="font-mono text-orange-400">{formatUAH(value)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-800">
            <span className="text-gray-300 font-medium">Разом</span>
            <span className="font-mono font-semibold text-orange-300">{formatUAH(stats.salaryPerTick + stats.rentPerTick)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Персонал</p>
          <p className="text-2xl font-bold text-white">{enterprise.employees.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Ефективність {Math.round(stats.avgEfficiency * 100)}%</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Настрій</p>
          <p className={cn("text-2xl font-bold", stats.avgMood >= 0.7 ? "text-emerald-400" : stats.avgMood >= 0.4 ? "text-amber-400" : "text-red-400")}>
            {Math.round(stats.avgMood * 100)}%
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{enterprise.employees.filter(e => e.isOnStrike).length} на страйку</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="flex items-center gap-2">
          {enterprise.energySourceType === "SOLAR_AUTONOMOUS" ? <Leaf size={14} className="text-emerald-400" /> : <Zap size={14} className="text-yellow-400" />}
          <h3 className="text-sm font-semibold text-white">Електропостачання</h3>
        </div>
        <p className="text-sm text-gray-400">
          {enterprise.energySourceType === "GRID" ? "Міська мережа" : enterprise.energySourceType === "SOLAR_AUTONOMOUS" ? "Сонячна електростанція" : "Дизельний генератор (резерв)"}
        </p>
        {enterprise.energySourceType !== "GRID" && (
          <div className="text-xs text-gray-500 space-y-1">
            {enterprise.solarCapacityKw > 0 && <p>СЕС: {enterprise.solarCapacityKw} кВт</p>}
            {enterprise.batteryCapacityKwh > 0 && <p>Батарея: {enterprise.currentBatteryKwh.toFixed(1)} / {enterprise.batteryCapacityKwh} кВт·год</p>}
          </div>
        )}
      </div>

      {/* Production history mini-chart */}
      {(() => {
        // Aggregate by tick (sum unitsProduced)
        const tickMap = new Map<string, number>();
        for (const l of productionLogs) {
          tickMap.set(l.tickNumber, (tickMap.get(l.tickNumber) ?? 0) + l.unitsProduced);
        }
        const ticks = [...tickMap.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .slice(-12);

        if (ticks.length === 0) {
          return (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-6 text-center">
              <Factory size={24} className="text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-600">Виробництво ще не розпочато</p>
            </div>
          );
        }

        const maxVal = Math.max(...ticks.map(([, v]) => v), 1);
        const totalUnits = ticks.reduce((s, [, v]) => s + v, 0);
        const avgUnits   = totalUnits / ticks.length;

        return (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Виробництво (останні тіки)</h3>
              <span className="text-xs text-gray-500">сер. {formatNumber(Math.round(avgUnits))} од/тік</span>
            </div>
            <div className="flex items-end gap-1 h-16">
              {ticks.map(([tick, val]) => {
                const pct = (val / maxVal) * 100;
                return (
                  <div key={tick} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full rounded-t bg-emerald-600 group-hover:bg-emerald-500 transition-colors cursor-default"
                      style={{ height: `${Math.max(4, pct)}%` }}
                    />
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-white whitespace-nowrap z-10">
                      Тік {tick}: {formatNumber(Math.round(val))} од.
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>Тік {ticks[0]?.[0]}</span>
              <span>Тік {ticks[ticks.length - 1]?.[0]}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Buy Equipment Modal ──────────────────────────────────────────────────────

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
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
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

function WorkshopsTab({
  enterprise, onRefresh,
}: { enterprise: EnterpriseData; onRefresh: () => void }) {
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

          return (
            <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{w.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{w.footprintM2} м² · макс {w.maxCapacity} од/тік</p>
                </div>
                <div className="flex items-center gap-2">
                  {brokenCount > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/15 rounded px-1.5 py-0.5"><Hammer size={9} /> {brokenCount}</span>}
                  {wornCount > 0   && <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/15 rounded px-1.5 py-0.5"><Wrench size={9} /> {wornCount}</span>}
                  <span className={cn("text-[10px] font-medium rounded-full px-2 py-0.5", w.isActive ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 bg-gray-800")}>
                    {w.isActive ? "Активний" : "Зупинено"}
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Volume control */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <SlidersHorizontal size={9} /> Обсяг виробництва
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">{vol} / {w.maxCapacity} · {capacityPct}%</span>
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
                        "text-[10px] px-2 py-1 rounded font-medium transition-all",
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
                </div>

                {/* Recipe / Production Order */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Рецепт / продукт</p>
                    {activeOrder?.recipe ? (
                      <p className="text-sm text-white font-medium">{activeOrder.recipe.name}</p>
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
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Обладнання</p>
                    <button
                      onClick={() => setBuyEquipWs(w)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
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
                            <span className="flex-1 text-gray-300 truncate">{eq.name}</span>
                            <span className={cn("font-medium shrink-0", STATUS_COLOR[eq.status] ?? "text-gray-400")}>{STATUS_UA[eq.status] ?? eq.status}</span>
                            <div className="w-16 shrink-0"><WearBar value={eq.wearAndTear} /></div>
                            {eq.isBroken ? (
                              <button
                                onClick={() => doEquipAction(eq.id, "repair")}
                                disabled={busy}
                                className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={10} className="animate-spin" /> : `Рем. ₴${(maintCost * 2 / 1000).toFixed(0)}K`}
                              </button>
                            ) : (eq.status === "WORN" || eq.wearAndTear > 0.3) ? (
                              <button
                                onClick={() => doEquipAction(eq.id, "maintenance")}
                                disabled={busy}
                                className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={10} className="animate-spin" /> : `ТО ₴${(maintCost / 1000).toFixed(0)}K`}
                              </button>
                            ) : (
                              <span className="text-gray-600 text-[10px] w-16 text-right shrink-0">{formatUAH(eq.marketValueUah)}</span>
                            )}
                          </div>
                          {msg && (
                            <div className={cn("px-3 py-1.5 text-[10px] font-medium", msg.ok ? "bg-emerald-950/60 text-emerald-400" : "bg-red-950/60 text-red-400")}>
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

function SalaryRow({ profession, count, currentSalary, enterpriseId, onSaved }: {
  profession: string; count: number; currentSalary: number;
  enterpriseId: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(currentSalary);
  const [saving,  setSaving]  = useState(false);

  async function save() {
    if (value === currentSalary) { setEditing(false); return; }
    setSaving(true);
    await fetch(`/api/enterprises/${enterpriseId}/hr`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ roleId: profession, salary: value }),
    });
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 last:border-0">
      <div className="flex-1">
        <span className="text-xs text-gray-300">{PROF_UA[profession] ?? profession}</span>
        <span className="ml-2 text-[10px] text-gray-600">{count} ос.</span>
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value}
            onChange={e => setValue(Number(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            className="w-28 rounded-md border border-emerald-500/40 bg-gray-800 px-2 py-1 text-xs font-mono text-white focus:outline-none"
          />
          <button onClick={save} disabled={saving} className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
            {saving ? "…" : "✓"}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-600 hover:text-gray-400">✕</button>
        </div>
      ) : (
        <button
          onClick={() => { setValue(currentSalary); setEditing(true); }}
          className="text-xs font-mono text-gray-300 hover:text-emerald-400 transition-colors group flex items-center gap-1"
          title="Натисніть щоб змінити"
        >
          {formatUAH(currentSalary)}
          <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>
      )}
    </div>
  );
}

function HRTab({
  enterprise, onRefresh,
}: { enterprise: EnterpriseData; onRefresh: () => void }) {
  const [hireModal, setHireModal]   = useState(false);
  const [firing, setFiring]         = useState<string | null>(null);
  const employees = enterprise.employees;
  const onStrike  = employees.filter(e => e.isOnStrike);

  // Group by profession for salary editing
  const profGroups = employees.reduce<Record<string, { count: number; salary: number }>>((acc, e) => {
    if (!acc[e.profession]) acc[e.profession] = { count: 0, salary: e.salaryUah };
    acc[e.profession].count++;
    return acc;
  }, {});

  async function fireEmployee(employeeId: string) {
    if (!confirm("Звільнити цього співробітника?")) return;
    setFiring(employeeId);
    await fetch(`/api/enterprises/${enterprise.id}/hire`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    setFiring(null);
    onRefresh();
  }

  const [settling, setSettling] = useState(false);
  async function settleStrikes() {
    setSettling(true);
    await fetch(`/api/enterprises/${enterprise.id}/hr`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "resolveStrike" }),
    });
    setSettling(false);
    onRefresh();
  }

  return (
    <div className="space-y-4">
      {onStrike.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <span className="flex items-center gap-2"><AlertCircle size={14} /> {onStrike.length} співробітників на страйку</span>
          <button onClick={settleStrikes} disabled={settling} className="shrink-0 flex items-center gap-1 text-xs bg-red-900/60 hover:bg-red-800/60 text-red-300 px-2 py-1 rounded-md transition-colors">
            {settling ? <Loader2 size={10} className="animate-spin" /> : null}
            Врегулювати (+₴500/ос.)
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{employees.length} {employees.length === 1 ? "співробітник" : "співробітники"}</p>
        <Button size="sm" onClick={() => setHireModal(true)}>
          <Plus size={13} /> Найняти
        </Button>
      </div>

      {Object.keys(profGroups).length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Зарплати за посадою</p>
            <p className="text-[10px] text-gray-600">Натисніть суму для редагування</p>
          </div>
          {Object.entries(profGroups).map(([prof, { count, salary }]) => (
            <SalaryRow
              key={prof}
              profession={prof}
              count={count}
              currentSalary={salary}
              enterpriseId={enterprise.id}
              onSaved={onRefresh}
            />
          ))}
        </div>
      )}

      {employees.length === 0 ? (
        <div className="py-16 text-center">
          <Users size={28} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-3">Персоналу немає</p>
          <Button size="sm" onClick={() => setHireModal(true)}><Plus size={13} /> Найняти першого</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_90px_90px_70px_36px] px-4 py-2 border-b border-gray-800">
            {["Співробітник", "Посада", "Зарплата", "Настрій", "Ефект.", ""].map(h => (
              <span key={h} className="text-[10px] uppercase tracking-wider text-gray-500">{h}</span>
            ))}
          </div>
          {employees.map(emp => (
            <div
              key={emp.id}
              className={cn(
                "grid grid-cols-[1fr_120px_90px_90px_70px_36px] items-center px-4 py-3 border-b border-gray-800 last:border-0",
                emp.isOnStrike ? "bg-red-500/5" : "hover:bg-gray-800/40 transition-colors",
              )}
            >
              <div>
                <p className="text-sm text-white font-medium">{emp.firstName} {emp.lastName}</p>
                {emp.isOnStrike && <p className="text-[10px] text-red-400">На страйку</p>}
              </div>
              <span className="text-xs text-gray-400">{PROF_UA[emp.profession] ?? emp.profession}</span>
              <span className="text-xs font-mono text-gray-300">{formatUAH(emp.salaryUah)}</span>
              <MoodBar value={emp.mood} />
              <span className="text-xs font-mono text-gray-400">{Math.round(emp.efficiency * 100)}%</span>
              <button
                onClick={() => fireEmployee(emp.id)}
                disabled={firing === emp.id}
                className="text-gray-600 hover:text-red-400 transition-colors"
              >
                {firing === emp.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Сумарний ФОП (брутто + ЄСВ 22%)</span>
          <span className="font-mono font-semibold text-orange-400">
            {formatUAH(employees.reduce((s, e) => s + e.salaryUah * 1.22, 0))} / місяць
          </span>
        </div>
      </div>

      {hireModal && (
        <HireModal
          enterpriseId={enterprise.id}
          enterpriseType={enterprise.type}
          onHired={() => { setHireModal(false); onRefresh(); }}
          onClose={() => setHireModal(false)}
        />
      )}
    </div>
  );
}

function WarehouseTab({ inventory }: { inventory: InventoryItem[] }) {
  if (inventory.length === 0) {
    return <div className="py-16 text-center"><Package size={28} className="text-gray-700 mx-auto mb-3" /><p className="text-gray-500 text-sm">Склад порожній</p></div>;
  }
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_80px_80px] px-4 py-2 border-b border-gray-800">
        {["Товар", "SKU", "Кількість", "Якість"].map(h => (
          <span key={h} className="text-[10px] uppercase tracking-wider text-gray-500">{h}</span>
        ))}
      </div>
      {inventory.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px_80px] items-center px-4 py-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
          <span className="text-sm text-white">{productEmoji(item.product.sku)} {item.product.nameUa}</span>
          <span className="text-xs text-gray-500 font-mono">{item.product.sku}</span>
          <span className="text-sm font-mono text-gray-300">{formatNumber(item.quantity)} {item.product.unit}</span>
          <span className={cn("text-sm font-mono", item.quality >= 8 ? "text-emerald-400" : item.quality >= 5 ? "text-amber-400" : "text-red-400")}>{item.quality.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ShowcaseTab ───────────────────────────────────────────────────────────────

interface ShowcaseItem {
  productId: string; sku: string; nameUa: string; unit: string;
  baseUnitsPerDay: number; referencePrice: number;
  inStock: number; avgQuality: number;
  playerPrice: number | null; isActive: boolean; estimatedDemand: number;
}

function ShowcaseTab({ enterpriseId, onGoToSupply }: { enterpriseId: string; onGoToSupply: () => void }) {
  const [data,     setData]     = useState<{ cityName: string; items: ShowcaseItem[] } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ShowcaseItem | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/enterprises/${enterpriseId}/showcase`)
      .then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [enterpriseId]);
  useEffect(() => { load(); }, [load]);

  function openItem(item: ShowcaseItem) {
    setSelected(item);
    setPriceInput(item.playerPrice ? item.playerPrice.toFixed(2) : item.referencePrice.toFixed(2));
    setSaveMsg(null);
  }

  // Попередній розрахунок попиту на основі введеної ціни
  function previewDemand(item: ShowcaseItem, price: number): number {
    if (!price || price <= 0) return item.baseUnitsPerDay;
    const e = 1.2;
    return Math.max(0, item.baseUnitsPerDay * Math.pow(item.referencePrice / price, e));
  }

  async function savePrice() {
    if (!selected) return;
    const price = parseFloat(priceInput);
    if (!price || price <= 0) { setSaveMsg("Введіть коректну ціну"); return; }
    setSaving(true); setSaveMsg(null);
    const res = await fetch(`/api/enterprises/${enterpriseId}/showcase`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: selected.productId, price, isActive: true }),
    });
    setSaving(false);
    if (res.ok) { setSaveMsg("✓ Збережено"); load(); }
    else { const d = await res.json(); setSaveMsg(d.error ?? "Помилка"); }
  }

  if (loading) return <div className="py-12 text-center text-gray-500">Завантаження…</div>;
  if (!data) return null;

  const previewPrice = parseFloat(priceInput);
  const demand       = selected ? previewDemand(selected, previewPrice) : 0;
  const revenue      = selected ? demand * previewPrice : 0;
  const refRevenue   = selected ? selected.baseUnitsPerDay * selected.referencePrice : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Товари з NPC-попитом у <span className="text-white font-medium">{data.cityName}</span>.
        Виставте ціну — попит змінюється відповідно до еластичності.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.items.map(item => (
          <div
            key={item.productId}
            onClick={() => openItem(item)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all cursor-pointer",
              selected?.productId === item.productId
                ? "border-emerald-500 bg-emerald-500/10"
                : item.isActive
                  ? "border-emerald-800/50 bg-gray-900 hover:border-emerald-600"
                  : item.inStock > 0
                    ? "border-gray-700 bg-gray-900 hover:border-gray-600"
                    : "border-gray-800 bg-gray-900 hover:border-gray-700",
            )}
          >
            <div className="text-3xl mb-2">{productEmoji(item.sku)}</div>
            <p className="text-sm font-medium text-white leading-tight">{item.nameUa}</p>
            {item.playerPrice ? (
              <p className="text-xs text-emerald-400 mt-1 font-mono">₴{item.playerPrice.toFixed(2)}/{item.unit}</p>
            ) : (
              <p className="text-xs text-gray-600 mt-1">Ціна не встановлена</p>
            )}
            <p className="text-xs text-gray-500 mt-0.5">
              {item.isActive ? `~${item.estimatedDemand.toFixed(1)}/день` : `${item.baseUnitsPerDay.toFixed(0)}/день база`}
            </p>
            {item.inStock > 0 ? (
              <p className="text-xs text-blue-400 mt-1.5 font-mono">{item.inStock.toFixed(0)} {item.unit} на складі</p>
            ) : (
              <p className="text-xs text-red-400/70 mt-1.5">Немає на складі</p>
            )}
            <div className="flex gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
              <Link
                href={`/market?product=${item.productId}`}
                className="flex-1 text-center text-xs px-2 py-1 rounded-lg bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-400 transition-colors"
              >
                🛒 Ринок
              </Link>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="rounded-xl border border-emerald-600/30 bg-gray-900 p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="text-3xl">{productEmoji(selected.sku)}</span>
            <div>
              <p className="font-semibold text-white">{selected.nameUa}</p>
              <p className="text-xs text-gray-400">Базовий NPC попит: {selected.baseUnitsPerDay.toFixed(1)} {selected.unit}/день · Довідкова ціна: ₴{selected.referencePrice}</p>
            </div>
          </div>

          {/* Price input */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Ціна продажу (₴/{selected.unit})</label>
            <div className="flex gap-2">
              <input
                type="number" min={0.01} step={0.01}
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder={`≈ ${selected.referencePrice}`}
              />
              <Button onClick={savePrice} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 shrink-0">
                {saving ? <Loader2 size={13} className="animate-spin" /> : "Зберегти"}
              </Button>
            </div>
            {saveMsg && <p className={cn("text-xs", saveMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400")}>{saveMsg}</p>}
          </div>

          {/* Live demand preview */}
          {previewPrice > 0 && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-gray-800 p-2">
                <p className="text-xs text-gray-500">Попит/день</p>
                <p className={cn("text-sm font-semibold", demand < selected.baseUnitsPerDay ? "text-amber-400" : "text-emerald-400")}>
                  {demand.toFixed(1)} {selected.unit}
                </p>
              </div>
              <div className="rounded-lg bg-gray-800 p-2">
                <p className="text-xs text-gray-500">Дохід/день</p>
                <p className="text-sm font-semibold text-white">₴{revenue.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="rounded-lg bg-gray-800 p-2">
                <p className="text-xs text-gray-500">vs довідк.</p>
                <p className={cn("text-sm font-semibold", revenue >= refRevenue ? "text-emerald-400" : "text-amber-400")}>
                  {revenue >= refRevenue ? "+" : ""}{((revenue / refRevenue - 1) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/market?product=${selected.productId}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-400 text-xs font-medium transition-colors"
            >
              🛒 Ринок
            </Link>
            <button
              onClick={onGoToSupply}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
            >
              🏭 Постачання
            </button>
            <button
              onClick={async () => {
                if (!confirm("Запустити акцію: −15% ціна, ×1.5 частка NPC попиту на 5 тіків. Вартість ₴5 000. Продовжити?")) return;
                const res = await fetch(`/api/enterprises/${enterpriseId}/showcase`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ productId: selected.productId, startPromotion: true }),
                });
                const d = await res.json();
                if (res.ok) { setSaveMsg("✓ Акцію запущено на 5 тіків"); load(); }
                else setSaveMsg(`✗ ${d.error}`);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-700/30 border border-purple-500/30 hover:bg-purple-700/50 text-purple-300 text-xs font-medium transition-colors"
            >
              🏷️ Акція −15% (₴5 000)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogsTab({ logs }: { logs: FinancialLog[] }) {
  if (logs.length === 0) {
    return <div className="py-16 text-center"><TrendingUp size={28} className="text-gray-700 mx-auto mb-3" /><p className="text-gray-500 text-sm">Фінансових записів ще немає</p></div>;
  }
  return (
    <div className="space-y-2">
      {logs.map(l => {
        const isIncome = l.amountUah > 0;
        return (
          <div key={l.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-800 bg-gray-900">
            {isIncome ? <TrendingUp size={14} className="text-emerald-400 shrink-0" /> : <TrendingDown size={14} className="text-red-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{l.description}</p>
              <p className="text-xs text-gray-500">{l.category} · Тік #{l.tickNumber}</p>
            </div>
            <span className={cn("text-sm font-mono font-semibold shrink-0", isIncome ? "text-emerald-400" : "text-red-400")}>
              {isIncome ? "+" : ""}{formatUAH(Math.abs(l.amountUah))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Supply Tab ────────────────────────────────────────────────────────────────

function SupplyTab({ enterpriseId }: { enterpriseId: string }) {
  const [routes, setRoutes]   = useState<{
    id: string; productName: string; unit: string; qtyPerTick: number; isActive: boolean;
    sourceName: string; targetName: string; sourceEnterpriseId: string; targetEnterpriseId: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/supply-routes")
      .then(r => r.json())
      .then(d => {
        const all: typeof routes = d.routes ?? [];
        setRoutes(all.filter(r =>
          r.sourceEnterpriseId === enterpriseId || r.targetEnterpriseId === enterpriseId
        ));
      })
      .finally(() => setLoading(false));
  }, [enterpriseId]);

  async function toggle(id: string, current: boolean) {
    setToggling(id);
    await fetch(`/api/supply-routes/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isActive: !current }),
    });
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, isActive: !current } : r));
    setToggling(null);
  }

  async function remove(id: string) {
    if (!confirm("Видалити маршрут?")) return;
    await fetch(`/api/supply-routes/${id}`, { method: "DELETE" });
    setRoutes(prev => prev.filter(r => r.id !== id));
  }

  const outgoing = routes.filter(r => r.sourceEnterpriseId === enterpriseId);
  const incoming = routes.filter(r => r.targetEnterpriseId === enterpriseId);

  if (loading) return <div className="py-12 text-center text-gray-600 text-sm">Завантаження…</div>;

  if (routes.length === 0) return (
    <div className="rounded-xl border border-dashed border-gray-800 py-14 text-center">
      <Truck size={28} className="text-gray-700 mx-auto mb-3" />
      <p className="text-gray-500 text-sm mb-2">Маршрутів постачання немає</p>
      <a href="/warehouses" className="text-xs text-emerald-500 hover:text-emerald-400">Налаштувати у Складах →</a>
    </div>
  );

  const Section = ({ title, items, dir }: { title: string; items: typeof routes; dir: "out" | "in" }) => (
    items.length > 0 ? (
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.id} className={cn("rounded-xl border bg-gray-900 px-4 py-3 flex items-center gap-3", r.isActive ? "border-gray-800" : "border-gray-800 opacity-50")}>
              <div className={cn("p-1.5 rounded-lg", dir === "out" ? "bg-blue-950" : "bg-emerald-950")}>
                <Truck size={13} className={dir === "out" ? "text-blue-400" : "text-emerald-400"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {dir === "out" ? `→ ${r.targetName}` : `← ${r.sourceName}`}
                </p>
                <p className="text-xs text-gray-500">{r.productName} · {formatNumber(r.qtyPerTick)} {r.unit}/тік</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", r.isActive ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-500")}>
                  {r.isActive ? "Активний" : "Пауза"}
                </span>
                <button
                  onClick={() => toggle(r.id, r.isActive)}
                  disabled={toggling === r.id}
                  className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
                  title={r.isActive ? "Призупинити" : "Активувати"}
                >
                  {toggling === r.id ? <Loader2 size={12} className="animate-spin" /> : r.isActive ? "⏸" : "▶"}
                </button>
                <button onClick={() => remove(r.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-5">
      <Section title="Вихідні маршрути (відправляє)" items={outgoing} dir="out" />
      <Section title="Вхідні маршрути (отримує)"   items={incoming} dir="in" />
      <div className="text-center pt-2">
        <a href="/warehouses" className="text-xs text-gray-500 hover:text-emerald-400 transition-colors">
          Керувати всіма маршрутами →
        </a>
      </div>
    </div>
  );
}

// ─── Fields Tab (AGRO_FARM) ────────────────────────────────────────────────────

const AGRO_SEASON_MULTS_UI: Record<string, [number, number, number, number]> = {
  'RM-WHEAT':     [1.0, 0.8, 0.15, 0.0],
  'RM-SUNFL':     [0.2, 1.0, 0.75, 0.0],
  'RM-SUGBEET':   [0.4, 0.8, 1.0,  0.0],
  'RM-CORN':      [0.3, 1.0, 0.80, 0.0],
  'RM-MILK':      [1.0, 0.9, 1.0,  0.75],
  'RM-LIVESTOCK': [1.0, 1.0, 1.0,  0.80],
  'SF-COMPOST':   [1.0, 1.0, 1.0,  1.00],
};
const ROTATION_NEXT_UI: Record<string, string> = {
  'RM-WHEAT': 'RM-SUNFL', 'RM-SUNFL': 'RM-SUGBEET', 'RM-SUGBEET': 'RM-WHEAT', 'RM-CORN': 'RM-WHEAT',
};
const FIELD_CROPS_UI = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);

function FieldsTab({ enterprise, agroInfo }: { enterprise: EnterpriseData; agroInfo: AgroInfo | null }) {
  const season   = agroInfo?.seasonIndex ?? 0;
  const lastCrop = agroInfo?.lastCropSku ?? null;

  return (
    <div className="space-y-3 p-1">
      {agroInfo && (
        <div className="text-xs text-gray-500">
          Якість ґрунту <span className="font-mono text-white">{agroInfo.soilQuality.toFixed(1)}/10</span>
          {" · "}Сезон: <span className="text-white">{agroInfo.currentSeason}</span>
          {" · "}Остання культура: <span className="font-mono text-white">{agroInfo.lastCropSku ?? "—"}</span>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {enterprise.workshops.map((ws) => {
          const order   = ws.productionOrders[0] ?? null;
          const cropSku = order?.recipe?.outputs?.[0]?.product?.sku ?? null;
          const cropName = order?.recipe?.outputs?.[0]?.product?.nameUa ?? null;
          const seasonMult = cropSku ? (AGRO_SEASON_MULTS_UI[cropSku]?.[season] ?? 1.0) : null;

          let rotationStatus: 'optimal' | 'mono' | 'neutral' | null = null;
          if (cropSku && FIELD_CROPS_UI.has(cropSku)) {
            if (lastCrop === cropSku) rotationStatus = 'mono';
            else if (lastCrop && ROTATION_NEXT_UI[lastCrop] === cropSku) rotationStatus = 'optimal';
            else if (lastCrop) rotationStatus = 'neutral';
          }

          const multColor = seasonMult === null ? '' : seasonMult >= 0.8 ? 'text-emerald-400' : seasonMult >= 0.4 ? 'text-amber-400' : 'text-red-400';

          return (
            <div key={ws.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white leading-tight">{ws.name}</p>
                <span className="shrink-0 text-[10px] text-gray-500 font-mono">{ws.footprintM2.toLocaleString()} м²</span>
              </div>
              {cropSku ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-emerald-300">{cropSku}</span>
                    <span className="text-xs text-gray-500">{cropName}</span>
                  </div>
                  {seasonMult !== null && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Сезон:</span>
                      <span className={`font-mono font-semibold ${multColor}`}>{Math.round(seasonMult * 100)}%</span>
                      {seasonMult === 0 && <span className="text-red-500">позасезонно</span>}
                    </div>
                  )}
                  {rotationStatus === 'optimal' && (
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span>✓ Оптимальна ротація +15%</span>
                    </div>
                  )}
                  {rotationStatus === 'mono' && (
                    <div className="text-[10px] text-red-400 flex items-center gap-1">
                      <span>✗ Монокультура −15%</span>
                    </div>
                  )}
                  {rotationStatus === 'neutral' && (
                    <div className="text-[10px] text-gray-500">— Нейтральна ротація</div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic">Немає активного виробництва</p>
              )}
              <div className={cn("text-[10px] px-1.5 py-0.5 rounded w-fit", ws.isActive ? "text-emerald-500 bg-emerald-950" : "text-gray-600 bg-gray-800")}>
                {ws.isActive ? "активний" : "не активний"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

// ── ExpandTab ────────────────────────────────────────────────────────────────
function ExpandTab({ enterpriseId, enterpriseType }: { enterpriseId: string; enterpriseType: string }) {
  const [recipes,   setRecipes]   = useState<{ id: string; name: string }[]>([]);
  const [recipeId,  setRecipeId]  = useState("");
  const [areaM2,    setAreaM2]    = useState("100");
  const [name,      setName]      = useState("");
  const [msg,       setMsg]       = useState("");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/recipes?type=" + enterpriseType)
      .then(r => r.json())
      .then(d => { setRecipes(d.recipes ?? []); if ((d.recipes ?? []).length > 0) setRecipeId(d.recipes[0].id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enterpriseType]);

  const cost = Math.round(parseFloat(areaM2 || "0") * 2500);
  const ticks = Math.max(2, Math.ceil(parseFloat(areaM2 || "0") / 50));

  const handleExpand = async () => {
    if (!recipeId || !areaM2) { setMsg("Заповніть усі поля"); return; }
    const res  = await fetch(`/api/enterprises/${enterpriseId}/expand`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, areaM2: parseFloat(areaM2), name: name || undefined }),
    });
    const data = await res.json();
    setMsg(res.ok ? `✓ ${data.message}` : `✗ ${data.error}`);
  };

  if (loading) return <p className="text-gray-500 text-sm">Завантаження рецептів...</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-4">
        <p className="text-sm font-semibold text-white">Побудувати новий цех</p>
        <p className="text-xs text-gray-500">Вартість ₴2 500/м² · Час: 1 тік на кожні 50 м² (мін. 2 тіки)</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Рецепт для цеху</label>
            <select value={recipeId} onChange={e => setRecipeId(e.target.value)}
              className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white">
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Площа (м²)</label>
              <input type="number" min={50} step={50} value={areaM2} onChange={e => setAreaM2(e.target.value)}
                className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Назва (необов'язково)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="автоматична"
                className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>Вартість: <strong className="text-white">₴{cost.toLocaleString("uk-UA")}</strong></span>
            <span>Час: <strong className="text-white">{ticks} тік(ів)</strong></span>
          </div>
        </div>
        {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
        <button onClick={handleExpand}
          className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm py-2 font-medium transition-colors">
          Розпочати будівництво
        </button>
      </div>
    </div>
  );
}

// ── StaffTab ─────────────────────────────────────────────────────────────────
function StaffTab({ enterpriseId }: { enterpriseId: string }) {
  const [employees, setEmployees] = useState<{
    id: string; name: string; profession: string; salary: number; mood: number;
    efficiency: number; baseEfficiency: number; qualificationLevel: number; isOnStrike: boolean;
    activeTraining: { targetLevel: number; ticksRemaining: number; ticksRequired: number } | null;
  }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [training, setTraining] = useState<string | null>(null);
  const [msgs,     setMsgs]     = useState<Record<string, string>>({});

  const load = () => {
    fetch(`/api/enterprises/${enterpriseId}/employees`)
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [enterpriseId]);

  const startTraining = async (empId: string) => {
    setTraining(empId);
    const res  = await fetch("/api/training", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ employeeId: empId }),
    });
    const data = await res.json();
    setMsgs(prev => ({ ...prev, [empId]: res.ok ? `✓ ${data.message}` : `✗ ${data.error}` }));
    if (res.ok) load();
    setTraining(null);
  };

  const TRAINING_COST: Record<number, number> = { 1: 8_000, 2: 12_000, 3: 18_000, 4: 24_000, 5: 35_000 };
  const moodColor = (m: number) => m < 0.3 ? "text-red-400" : m < 0.6 ? "text-amber-400" : "text-emerald-400";

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;
  if (employees.length === 0) return <p className="text-gray-500 text-sm">Немає найнятих працівників.</p>;

  return (
    <div className="space-y-3">
      {employees.map(e => (
        <div key={e.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-white text-sm">{e.name}</p>
              <p className="text-xs text-gray-500">{e.profession} · ₴{e.salary.toLocaleString("uk-UA")}/міс</p>
            </div>
            <div className="flex items-center gap-2">
              {e.isOnStrike && <span className="text-[10px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded-full">СТРАЙК</span>}
              <span className="text-[10px] bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded-full">Кваліфікація {e.qualificationLevel}/5</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Настрій</p>
              <p className={`font-semibold ${moodColor(e.mood)}`}>{(e.mood * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Ефективність</p>
              <p className="font-semibold text-white">{(e.efficiency * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Базова eff.</p>
              <p className="font-semibold text-white">{(e.baseEfficiency * 100).toFixed(0)}%</p>
            </div>
          </div>

          {e.activeTraining ? (
            <div className="rounded-lg bg-blue-950/30 border border-blue-800/30 px-3 py-2 text-xs text-blue-300">
              Навчання до рівня {e.activeTraining.targetLevel} — залишилось {e.activeTraining.ticksRemaining} тік(ів)
            </div>
          ) : e.qualificationLevel < 5 ? (
            <div>
              <button onClick={() => startTraining(e.id)} disabled={training === e.id}
                className="w-full rounded-lg bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs py-2 font-medium transition-colors">
                {training === e.id ? "..." : `📚 Навчання → рівень ${e.qualificationLevel + 1} (₴${TRAINING_COST[e.qualificationLevel + 1]?.toLocaleString("uk-UA")})`}
              </button>
              {msgs[e.id] && <p className={`text-xs mt-1 ${msgs[e.id].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msgs[e.id]}</p>}
            </div>
          ) : (
            <p className="text-xs text-emerald-400 text-center">🏆 Максимальний рівень кваліфікації</p>
          )}
        </div>
      ))}
    </div>
  );
}

const BASE_TABS: { key: Tab; label: string }[] = [
  { key: "management", label: "Загальне" },
  { key: "workshops",  label: "Цехи" },
  { key: "expand",     label: "🔧 Розширення" },
  { key: "staff",      label: "👥 Персонал" },
  { key: "hr",         label: "HR" },
  { key: "warehouse",  label: "Склад" },
  { key: "supply",     label: "Постачання" },
  { key: "production", label: "Фінанси" },
  // "fields" is injected dynamically for AGRO_FARM
];

export default function EnterpriseDetailClient({ enterpriseId, initialTab }: Props) {
  const [tab,  setTab]  = useState<Tab>(initialTab ?? "management");
  const [data, setData] = useState<{
    enterprise: EnterpriseData;
    agroInfo: AgroInfo | null;
    stats: { salaryPerTick: number; rentPerTick: number; avgEfficiency: number; avgMood: number };
    logs: FinancialLog[];
    productionLogs: { tickNumber: string; unitsProduced: number; avgQuality: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/enterprises/${enterpriseId}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enterpriseId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data?.enterprise) {
    return (
      <div className="py-16 text-center space-y-4">
        <Building2 size={28} className="text-gray-700 mx-auto" />
        <p className="text-gray-400">Підприємство не знайдено</p>
        <Link href="/enterprises" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors">Назад</Link>
      </div>
    );
  }

  const { enterprise, agroInfo, stats, logs, productionLogs = [] } = data;
  const isActive = enterprise.isOperational && !enterprise.isSeized && !enterprise.isFrozenByInspection && !enterprise.isLegallyFrozen;
  const TABS: { key: Tab; label: string }[] =
    enterprise.type === "RETAIL_STORE"
      ? [...BASE_TABS.slice(0, 4), { key: "showcase", label: "🏪 Вітрина" }, ...BASE_TABS.slice(4)]
      : enterprise.type === "AGRO_FARM"
      ? [...BASE_TABS, { key: "fields", label: "🌾 Поля" }]
      : BASE_TABS;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="mt-1 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{enterprise.name}</h1>
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                <CheckCircle2 size={11} /> Активне
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">Неактивне</span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{enterprise.landPlot.city.nameUa} · {enterprise.type}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Цехів",        value: enterprise.workshops.length.toString() },
          { label: "Персонал",     value: enterprise.employees.length.toString() },
          { label: "Витрати/тік",  value: formatUAH(stats.salaryPerTick + stats.rentPerTick), color: "text-orange-400" },
          { label: "Ефективність", value: `${Math.round(stats.avgEfficiency * 100)}%`, color: stats.avgEfficiency >= 0.7 ? "text-emerald-400" : "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={cn("text-lg font-bold font-mono", color ?? "text-white")}>{value}</p>
          </div>
        ))}
      </div>

      {/* ─── AGRO_FARM агро-показники ──────────────────────────────────────── */}
      {enterprise.type === "AGRO_FARM" && agroInfo && (
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Leaf size={14} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Агро-показники</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Soil quality */}
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Якість ґрунту</p>
              <p className={cn("text-lg font-bold font-mono",
                agroInfo.soilQuality >= 8 ? "text-emerald-400" :
                agroInfo.soilQuality >= 5 ? "text-amber-400" : "text-red-400"
              )}>{agroInfo.soilQuality.toFixed(1)}<span className="text-xs text-gray-500 font-normal ml-1">/ 10</span></p>
              <div className="w-full h-1.5 rounded-full bg-gray-800">
                <div className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(agroInfo.soilQuality / 10) * 100}%` }} />
              </div>
            </div>
            {/* Season */}
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Поточний сезон</p>
              <p className={cn("text-lg font-bold",
                agroInfo.seasonIndex === 0 ? "text-emerald-400" :
                agroInfo.seasonIndex === 1 ? "text-yellow-400" :
                agroInfo.seasonIndex === 2 ? "text-orange-400" : "text-blue-400"
              )}>{agroInfo.currentSeason}</p>
              <p className="text-[10px] text-gray-600">Тік {agroInfo.tickNumber % 120}/120</p>
            </div>
            {/* Last crop + recommended next */}
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Остання культура</p>
              <p className="text-sm font-mono text-white">{agroInfo.lastCropSku ?? "—"}</p>
              {agroInfo.recommendedCropSku && (
                <p className="text-[10px] text-emerald-500">
                  → рекомендовано: <span className="font-mono">{agroInfo.recommendedCropSku}</span> (+15%)
                </p>
              )}
            </div>
            {/* Season multipliers reference */}
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Врожайність ×</p>
              {[['RM-WHEAT', [1.0,0.8,0.15,0.0]], ['RM-SUNFL', [0.2,1.0,0.75,0.0]], ['RM-MILK', [1.0,0.9,1.0,0.75]]].map(([sku, mults]) => (
                <div key={sku as string} className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-500">{(sku as string).replace('RM-','')}</span>
                  <span className={cn("font-mono font-medium",
                    (mults as number[])[agroInfo.seasonIndex] >= 0.8 ? "text-emerald-400" :
                    (mults as number[])[agroInfo.seasonIndex] >= 0.3 ? "text-amber-400" : "text-red-400"
                  )}>{((mults as number[])[agroInfo.seasonIndex] * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "text-emerald-400 border-emerald-400" : "text-gray-500 border-transparent hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "management" && <ManagementTab enterprise={enterprise} stats={stats} productionLogs={productionLogs} onToggleOperational={async (val) => {
        await fetch(`/api/enterprises/${enterpriseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOperational: val }) });
        load();
      }} />}
      {tab === "workshops"  && <WorkshopsTab enterprise={enterprise} onRefresh={load} />}
      {tab === "expand"     && <ExpandTab enterpriseId={enterpriseId} enterpriseType={enterprise.type} />}
      {tab === "staff"      && <StaffTab enterpriseId={enterpriseId} />}
      {tab === "hr"         && <HRTab enterprise={enterprise} onRefresh={load} />}
      {tab === "warehouse"  && <WarehouseTab inventory={enterprise.inventory} />}
      {tab === "showcase"   && <ShowcaseTab enterpriseId={enterpriseId} onGoToSupply={() => setTab("supply")} />}
      {tab === "supply"     && <SupplyTab enterpriseId={enterpriseId} />}
      {tab === "production" && <LogsTab logs={logs} />}
      {tab === "fields"     && <FieldsTab enterprise={enterprise} agroInfo={agroInfo} />}
    </div>
  );
}
