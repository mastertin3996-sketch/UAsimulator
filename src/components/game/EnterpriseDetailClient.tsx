"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Zap, Users, Package, Factory,
  AlertCircle, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Leaf, Plus, Trash2,
  BookOpen, Loader2, X, ChevronDown, Pencil, Truck,
} from "lucide-react";
import { cn, formatUAH, formatNumber } from "@/lib/utils";
import { QualityStars } from "@/components/game/QualityBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import SeasonalPlanner from "@/components/game/SeasonalPlanner";
import WorkshopsTab from "@/components/game/enterprise-tabs/WorkshopsTab";

// ─── Code-split secondary tabs (loaded only when opened) ──────────────────────
const MachineryTab = dynamic(() => import("@/components/game/enterprise-tabs/MachineryTab"), {
  loading: () => <p className="text-gray-500 text-sm">Завантаження...</p>,
});
const LivestockTab = dynamic(() => import("@/components/game/enterprise-tabs/LivestockTab"), {
  loading: () => <p className="text-gray-500 text-sm">Завантаження...</p>,
});
const FreightTab = dynamic(() => import("@/components/game/enterprise-tabs/FreightTab"), {
  loading: () => <p className="text-xs text-gray-500 p-2">Завантаження...</p>,
});
const B2bTab = dynamic(() => import("@/components/game/enterprise-tabs/B2bTab"), {
  loading: () => <p className="text-gray-500 text-sm">Завантаження...</p>,
});
const StaffTab = dynamic(() => import("@/components/game/enterprise-tabs/StaffTab"), {
  loading: () => <p className="text-gray-500 text-sm">Завантаження...</p>,
});
const FieldsTab = dynamic(() => import("@/components/game/enterprise-tabs/FieldsTab"), {
  loading: () => <p className="text-gray-500 text-sm">Завантаження...</p>,
});

// ─── Product emoji map ─────────────────────────────────────────────────────────

export const SKU_EMOJI: Record<string, string> = {
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

export function productEmoji(sku: string): string {
  return SKU_EMOJI[sku] ?? "📦";
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EquipCatalogItem { id: string; name: string; sku: string; basePrice: number; unit: string; footprintM2: number; canBuy: boolean }

type Tab = "management" | "workshops" | "hr" | "warehouse" | "production" | "supply" | "showcase" | "fields" | "staff" | "expand" | "machinery" | "livestock" | "freight" | "b2b";

interface Props { enterpriseId: string; initialTab?: Tab; title?: string }

interface Employee {
  id: string; firstName: string; lastName: string; profession: string;
  salaryUah: number; mood: number; efficiency: number;
  isOnStrike: boolean; hiredAt: string; accruedSalaryUah: number;
  workshopId: string | null;
}

interface Equipment {
  id: string; name: string; nameUa: string | null; status: string; wearAndTear: number;
  energyConsumptionKw: number; marketValueUah: number; isBroken: boolean;
  maintenanceCostUah: number;
}

interface ProductionOrder {
  id: string; targetQuantity: number; completedQuantity: number;
  outputQuality: number | null; ticksRemaining: number;
  recipe: { id: string; name: string; outputs: { product: { sku: string; nameUa: string; unit: string } }[] } | null;
}

export interface Workshop {
  id: string; name: string; footprintM2: number; maxCapacity: number;
  currentVolume: number; isActive: boolean; harvestAccumulated: number;
  autoHarvest: boolean; autoFertilize: boolean;
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

export interface AgroInfo {
  soilQuality:         number;
  lastCropSku:         string | null;
  fertilizerTicksLeft: number;
  pestDamageMult:      number;
  recommendedCropSku:  string | null;
  currentSeason:       string;
  seasonIndex:         number;
  tickNumber:          number;
  seedQuality?:        string;
  cropDiseaseType?:    string | null;
  cropDiseaseSeverity?: number;
  agroTourismEnabled?: boolean;
  agroTourismRevenuePerTick?: number;
  fieldOpsMask?:       number;
  nitrogenLevel?:      number;
  phosphorusLevel?:    number;
  potassiumLevel?:     number;
  moistureLevel?:      number;
  grainQualityClass?:  number;
  grainMoisturePct?:   number;
  plantedSeasonTick?:  number;
  intercroppingBonus?: { partnerCropSku: string; bonusPct: number } | null;
}

interface EnterpriseLicense {
  id: string; type: string; status: string; expiresAtTick: string | null;
}

export interface EnterpriseData {
  id: string; name: string; type: string;
  footprintM2: number; totalFloorAreaM2: number; usedFloorAreaM2: number;
  isOperational: boolean; isSeized: boolean; isFrozenByInspection: boolean;
  isLegallyFrozen: boolean; isCollateral: boolean;
  legalFreezeReason: string | null;
  energySourceType: string; solarCapacityKw: number;
  batteryCapacityKwh: number; currentBatteryKwh: number;
  constructedAt: string | null;
  licenses: EnterpriseLicense[];
  // AGRO_FARM fields
  extraFieldAreaM2: number;
  localWeatherMod: number | null;
  localWeatherDesc: string | null;
  landPlot: {
    monthlyLeaseCostUah: number; purchasePriceUah: number;
    energyTariffUah: number; status: string;
    city: { name: string; nameUa: string; region: string };
  };
  employees: Employee[];
  workshops: Workshop[];
  inventory: InventoryItem[];
}

export interface RecipeOption {
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
  // Агроферма
  VETERINARIAN: "Ветеринар", COMBINE_OPERATOR: "Оператор комбайна",
  FIELD_WORKER: "Польовий робітник", GRAIN_SPECIALIST: "Фахівець із зерна",
  BEEKEEPER: "Пасічник", LIVESTOCK_WORKER: "Тваринник", IRRIGATOR: "Іригатор",
  TRACTOR_OPERATOR: "Тракторист", FARM_WORKER: "Різнороб",
  MILKMAID: "Доярка", MILKING_OPERATOR: "Оператор ДС",
  DEBONER: "Обвалювальник", SLAUGHTER_TECH: "Технік цеху забою",
  WEAVER: "Ткач", TAILOR: "Кравець",
};

const PROF_SALARY: Record<string, number> = {
  ACCOUNTANT: 25000, MANAGER: 35000, OPERATOR: 18000, ENGINEER: 40000,
  AGRONOMIST: 22000, LOADER: 15000, DRIVER: 20000, SECURITY_GUARD: 15000,
  SECURITY_OFFICER: 30000, CLEANER: 12000, SALES_REP: 20000,
  IT_SPECIALIST: 50000, LAWYER: 45000, HR_SPECIALIST: 28000,
  TECHNICIAN: 22000, QUALITY_CONTROLLER: 25000, RESEARCHER: 35000, DATA_SCIENTIST: 60000,
  CASHIER: 16000, SALES_ASSISTANT: 18000, MERCHANDISER: 20000,
  VETERINARIAN: 28000, COMBINE_OPERATOR: 24000, FIELD_WORKER: 14000,
  GRAIN_SPECIALIST: 26000, BEEKEEPER: 18000, LIVESTOCK_WORKER: 16000, IRRIGATOR: 22000,
  TRACTOR_OPERATOR: 22_000, FARM_WORKER: 16_000, MILKMAID: 18_000,
  MILKING_OPERATOR: 20_000, DEBONER: 21_000, SLAUGHTER_TECH: 19_000,
  WEAVER: 21_000, TAILOR: 23_000,
};

// Які професії доступні для кожного типу підприємства
const UNIVERSAL_PROFS  = ["MANAGER","ACCOUNTANT","HR_SPECIALIST","LAWYER","IT_SPECIALIST","SECURITY_GUARD","SECURITY_OFFICER","CLEANER","LOADER","DRIVER"];
const PRODUCTION_PROFS = ["OPERATOR","ENGINEER","TECHNICIAN","QUALITY_CONTROLLER","AGRONOMIST","SALES_REP"];
const RETAIL_PROFS     = ["CASHIER","SALES_ASSISTANT","MERCHANDISER","SALES_REP"];
const LAB_PROFS        = ["RESEARCHER","DATA_SCIENTIST"];
const AGRO_PROFS       = ["AGRONOMIST","COMBINE_OPERATOR","FIELD_WORKER","GRAIN_SPECIALIST","BEEKEEPER","LIVESTOCK_WORKER","IRRIGATOR","VETERINARIAN","TECHNICIAN","TRACTOR_OPERATOR","FARM_WORKER","MILKMAID","MILKING_OPERATOR","DEBONER","SLAUGHTER_TECH"];
const AGRO_ADMIN_PROFS = ["MANAGER","ACCOUNTANT","DRIVER"];
const TEXTILE_PROFS    = ["WEAVER","TAILOR"];

function professionsForType(enterpriseType: string): string[] {
  if (enterpriseType === "RETAIL_STORE") return [...UNIVERSAL_PROFS, ...RETAIL_PROFS];
  if (enterpriseType === "RD_LABORATORY") return [...UNIVERSAL_PROFS, ...PRODUCTION_PROFS, ...LAB_PROFS];
  if (enterpriseType === "AGRO_FARM") return [...AGRO_ADMIN_PROFS, ...AGRO_PROFS];
  if (enterpriseType === "TEXTILE_FACTORY") return [...UNIVERSAL_PROFS, ...PRODUCTION_PROFS, ...TEXTILE_PROFS];
  return [...UNIVERSAL_PROFS, ...PRODUCTION_PROFS];
}

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

// ─── Hire Modal ────────────────────────────────────────────────────────────────

function HireModal({
  enterpriseId, enterpriseType, workshops, onHired, onClose,
}: { enterpriseId: string; enterpriseType: string; workshops: { id: string; name: string }[]; onHired: () => void; onClose: () => void }) {
  const professions = professionsForType(enterpriseType).map(k => [k, PROF_UA[k] ?? k] as [string, string]);
  const [profession, setProfession] = useState(professions[0][0]);
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? "");
  const [salary, setSalary]         = useState(PROF_SALARY[professions[0][0]] ?? 20000);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState("");

  function handleProfChange(p: string) {
    setProfession(p);
    setSalary(PROF_SALARY[p] ?? 20000);
  }

  async function hire() {
    if (!workshopId) { setErr("Спершу побудуйте хоча б один цех"); return; }
    setSaving(true); setErr("");
    const res = await fetch(`/api/enterprises/${enterpriseId}/hire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profession, workshopId, salaryUah: salary }),
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
          <button onClick={onClose} aria-label="Закрити" className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Цех</label>
            <div className="relative mt-1">
              <select
                value={workshopId}
                onChange={e => setWorkshopId(e.target.value)}
                disabled={workshops.length === 0}
                className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white appearance-none focus:outline-none focus:border-emerald-500 pr-8 disabled:opacity-50"
              >
                {workshops.length === 0
                  ? <option value="">Немає жодного цеху</option>
                  : workshops.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>

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
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
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
          <Button className="flex-1" onClick={hire} disabled={saving || workshops.length === 0}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Найняти
          </Button>
        </div>
      </div>
    </div>
  );
}

export const RECIPE_UA: Record<string, string> = {
  'Wheat Growing':              'Вирощування пшениці',
  'Sunflower Growing':          'Вирощування соняшнику',
  'Sugar Beet Growing':         'Вирощування цукрового буряку',
  'Corn Growing':               'Вирощування кукурудзи',
  'Dairy Farming':              'Молочне тваринництво',
  'Livestock Farming':          "М'ясне тваринництво",
  'Composting':                 'Компостування',
  'Beekeeping (Honey)':         'Бджільництво (мед)',
  'Bread Baking':               'Випікання хліба',
  'Pasta Production':           'Виробництво макаронів',
  'Sunflower Oil Pressing':     'Виготовлення олії',
  'Sugar Refining':             'Рафінування цукру',
  'Dairy Pasteurisation':       'Пастеризація молока',
  'Corn Starch Milling':        'Кукурудзяний крохмаль',
  'Pastry Baking':              'Випікання тістечок',
  'Corn Syrup Production':      'Кукурудзяний сироп',
  'Condensed Milk Making':      'Згущене молоко',
  'Meat Processing':            "Переробка м'яса",
  'Cheese Making':              'Виробництво сиру',
  'Butter Churning':            'Виробництво масла',
  'Sausage Making':             'Виробництво ковбас',
  'Steel Smelting':             'Виплавка сталі',
  'Steel Product Fabrication':  'Сталеві вироби',
  'Sawmilling':                 'Лісопилення',
  'Furniture Manufacturing':    'Меблеве виробництво',
  'Malting':                    'Солодове виробництво',
  'Beer Brewing':               'Пивоваріння',
  'Spirits Distillation':       'Дистиляція спирту',
  'Cotton Spinning':            'Прядіння бавовни',
  'Clothing Manufacturing':     'Виробництво одягу',
  'Wool Combing':               'Чесання вовни',
  'Knitwear Production':        'Виробництво трикотажу',
  'Beef Processing':            'Переробка яловичини',
  'Pork Processing':            'Переробка свинини',
  'Poultry Processing':         'Переробка птиці',
  'Milk Pasteurization':        'Пастеризація молока',
};

// ─── Recipe Picker Modal ───────────────────────────────────────────────────────

export function RecipeModal({
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
          <button onClick={onClose} aria-label="Закрити" className="text-gray-500 hover:text-white"><X size={16} /></button>
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
                  <p className="text-sm font-semibold text-white">{RECIPE_UA[r.name] ?? r.name}</p>
                  {isCurrent ? (
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Поточний</span>
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
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
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
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Персонал</p>
          <p className="text-2xl font-bold text-white">{enterprise.employees.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Ефективність {Math.round(stats.avgEfficiency * 100)}%</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Настрій</p>
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
              <h3 className="text-sm font-semibold text-white">Виробництво (останні дні)</h3>
              <span className="text-xs text-gray-500">сер. {formatNumber(Math.round(avgUnits))} од/день</span>
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
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white whitespace-nowrap z-10">
                      День {tick}: {formatNumber(Math.round(val))} од.
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>День {ticks[0]?.[0]}</span>
              <span>День {ticks[ticks.length - 1]?.[0]}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export const AGRO_SEASON_MULTS_UI: Record<string, [number, number, number, number]> = {
  'RM-WHEAT':      [1.0, 0.8, 0.15, 0.0],
  'RM-SUNFL':      [0.2, 1.0, 0.75, 0.0],
  'RM-SUGBEET':    [0.4, 0.8, 1.0,  0.0],
  'RM-CORN':       [0.3, 1.0, 0.80, 0.0],
  'RM-MILK':       [1.0, 0.9, 1.0,  0.75],
  'RM-LIVESTOCK':  [1.0, 1.0, 1.0,  0.80],
  'SF-COMPOST':    [1.0, 1.0, 1.0,  1.00],
};
export const ROTATION_NEXT_UI: Record<string, string> = {
  'RM-WHEAT': 'RM-SUNFL', 'RM-SUNFL': 'RM-SUGBEET', 'RM-SUGBEET': 'RM-WHEAT', 'RM-CORN': 'RM-WHEAT',
};
export const FIELD_CROPS_UI = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);

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
        <span className="ml-2 text-xs text-gray-600">{count} ос.</span>
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
          <button onClick={save} disabled={saving} aria-label="Зберегти" className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
            {saving ? "…" : "✓"}
          </button>
          <button onClick={() => setEditing(false)} aria-label="Скасувати" className="text-xs text-gray-600 hover:text-gray-400">✕</button>
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
            <p className="text-xs text-gray-600">Натисніть суму для редагування</p>
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
              <span key={h} className="text-xs uppercase tracking-wider text-gray-500">{h}</span>
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
                {emp.isOnStrike && <p className="text-xs text-red-400">На страйку</p>}
              </div>
              <span className="text-xs text-gray-400">{PROF_UA[emp.profession] ?? emp.profession}</span>
              <span className="text-xs font-mono text-gray-300">{formatUAH(emp.salaryUah)}</span>
              <MoodBar value={emp.mood} />
              <span className="text-xs font-mono text-gray-400">{Math.round(emp.efficiency * 100)}%</span>
              <button
                onClick={() => fireEmployee(emp.id)}
                disabled={firing === emp.id}
                aria-label="Звільнити"
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
          workshops={enterprise.workshops}
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
          <span key={h} className="text-xs uppercase tracking-wider text-gray-500">{h}</span>
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
  const [data,     setData]     = useState<{ cityName: string; items: ShowcaseItem[]; capacityKg: number; usedKg: number } | null>(null);
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

  const capPct = data.capacityKg > 0 ? Math.min(100, (data.usedKg / data.capacityKg) * 100) : 0;
  const capColor = capPct >= 95 ? "bg-red-500" : capPct >= 75 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Товари з NPC-попитом у <span className="text-white font-medium">{data.cityName}</span>.
        Виставте ціну — попит змінюється відповідно до еластичності.
      </p>

      {/* Ємність магазину */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Ємність магазину (100 кг/м²)</span>
          <span className={capPct >= 95 ? "text-red-400 font-semibold" : "text-white"}>
            {data.usedKg.toLocaleString("uk", { maximumFractionDigits: 0 })} / {data.capacityKg.toLocaleString("uk", { maximumFractionDigits: 0 })} кг
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", capColor)} style={{ width: `${capPct}%` }} />
        </div>
        {capPct >= 95 && (
          <p className="text-xs text-red-400">Магазин переповнений — нові поставки блокуються</p>
        )}
      </div>

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
            {item.avgQuality > 0 && (
              <div className="text-amber-400 mt-1"><QualityStars value={item.avgQuality} size="sm" /></div>
            )}
            {item.inStock > 0 ? (
              <p className="text-xs text-blue-400 mt-1.5 font-mono">{item.inStock.toFixed(0)} {item.unit} на складі</p>
            ) : (
              <p className="text-xs text-red-400/70 mt-1.5">Немає на складі</p>
            )}
            <div className="flex gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
              <Link
                href={`/market?product=${item.productId}&from=/enterprises/${enterpriseId}`}
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
              href={`/market?product=${selected.productId}&from=/enterprises/${enterpriseId}`}
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

interface SupplyRoute {
  id: string; productName: string; unit: string; qtyPerTick: number; isActive: boolean;
  sourceName: string; targetName: string; sourceEnterpriseId: string; targetEnterpriseId: string;
}

// Hoisted to module scope (was previously redefined on every SupplyTab render).
function SupplyRouteSection({ title, items, dir, togglingId, onToggle, onRemove }: {
  title: string; items: SupplyRoute[]; dir: "out" | "in";
  togglingId: string | null; onToggle: (id: string, current: boolean) => void; onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
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
              <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full", r.isActive ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-500")}>
                {r.isActive ? "Активний" : "Пауза"}
              </span>
              <button
                onClick={() => onToggle(r.id, r.isActive)}
                disabled={togglingId === r.id}
                className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
                title={r.isActive ? "Призупинити" : "Активувати"}
                aria-label={r.isActive ? "Призупинити" : "Активувати"}
              >
                {togglingId === r.id ? <Loader2 size={12} className="animate-spin" /> : r.isActive ? "⏸" : "▶"}
              </button>
              <button onClick={() => onRemove(r.id)} aria-label="Видалити маршрут" className="text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupplyTab({ enterpriseId }: { enterpriseId: string }) {
  const [routes, setRoutes]   = useState<SupplyRoute[]>([]);
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

  return (
    <div className="space-y-5">
      <SupplyRouteSection title="Вихідні маршрути (відправляє)" items={outgoing} dir="out" togglingId={toggling} onToggle={toggle} onRemove={remove} />
      <SupplyRouteSection title="Вхідні маршрути (отримує)"   items={incoming} dir="in" togglingId={toggling} onToggle={toggle} onRemove={remove} />
      <div className="text-center pt-2">
        <a href="/warehouses" className="text-xs text-gray-500 hover:text-emerald-400 transition-colors">
          Керувати всіма маршрутами →
        </a>
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
              <label className="text-xs text-gray-400">Назва (необов&apos;язково)</label>
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

// ── MachineryTab ─────────────────────────────────────────────────────────────
// ── LivestockTab ──────────────────────────────────────────────────────────────

// ─── TeamColumn (compact staff panel for 3-col layout) ────────────────────────

function TeamColumn({
  enterprise, stats, onRefresh,
}: {
  enterprise: EnterpriseData;
  stats: { salaryPerTick: number; avgEfficiency: number; avgMood: number };
  onRefresh: () => void;
}) {
  const [hireModal, setHireModal] = useState(false);
  const [firing,    setFiring]    = useState<string | null>(null);
  const [settling,  setSettling]  = useState(false);

  const employees = enterprise.employees;
  const onStrike  = employees.filter(e => e.isOnStrike);

  async function fireEmployee(id: string) {
    if (!confirm("Звільнити?")) return;
    setFiring(id);
    await fetch(`/api/enterprises/${enterprise.id}/hire`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: id }),
    });
    setFiring(null);
    onRefresh();
  }

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

  async function reassign(employeeId: string, workshopId: string | null) {
    await fetch(`/api/enterprises/${enterprise.id}/employees/${employeeId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ workshopId }),
    });
    onRefresh();
  }

  const unassigned = employees.filter(e => !e.workshopId);
  const groups: { id: string | null; name: string; employees: Employee[] }[] = [
    ...enterprise.workshops.map(ws => ({ id: ws.id, name: ws.name, employees: employees.filter(e => e.workshopId === ws.id) })),
    ...(unassigned.length > 0 ? [{ id: null, name: "Неприкріплені", employees: unassigned }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
          <Users size={12} /> Команда · {employees.length}
        </span>
        <button onClick={() => setHireModal(true)} className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors">
          + Найняти
        </button>
      </div>

      {onStrike.length > 0 && (
        <div className="mx-2 mt-2 rounded-lg border border-red-800/40 bg-red-950/10 px-3 py-2 text-[11px] text-red-400 flex items-center gap-2">
          <AlertCircle size={11} />
          <span className="flex-1">{onStrike.length} на страйку</span>
          <button onClick={settleStrikes} disabled={settling}
            className="text-xs text-red-300 hover:text-red-200 bg-red-900/40 rounded px-2 py-0.5">
            {settling ? "…" : "Врегулювати"}
          </button>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mx-2 mt-2 rounded-lg border border-amber-800/40 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-400 flex items-center gap-2">
          <AlertCircle size={11} />
          <span className="flex-1">{unassigned.length} без цеху — не впливають на виробництво</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <Users size={20} className="mb-2" />
            <p className="text-xs">Немає персоналу</p>
          </div>
        ) : groups.map(group => (
          <div key={group.id ?? "unassigned"}>
            <div className={cn(
              "px-3 py-1 text-[10px] uppercase tracking-wider sticky top-0 bg-gray-900/80",
              group.id === null ? "text-amber-500" : "text-gray-600",
            )}>
              {group.name} · {group.employees.length}
            </div>
            {group.employees.map(emp => {
              const moodPct = Math.round(emp.mood * 100);
              const moodBg  = moodPct >= 70 ? "bg-emerald-500" : moodPct >= 40 ? "bg-amber-500" : "bg-red-500";
              const moodTxt = moodPct >= 70 ? "text-emerald-400" : moodPct >= 40 ? "text-amber-400" : "text-red-400";
              const dotBg   = emp.isOnStrike ? "bg-red-400 animate-pulse" : moodPct >= 70 ? "bg-emerald-400" : moodPct >= 40 ? "bg-amber-400" : "bg-red-400";
              return (
                <div key={emp.id} className={cn(
                  "px-3 py-2.5 border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors",
                  emp.isOnStrike ? "bg-red-950/10" : "",
                )}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotBg)} />
                    <span className="text-xs font-medium text-white truncate flex-1">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <button onClick={() => fireEmployee(emp.id)} disabled={firing === emp.id}
                      aria-label="Звільнити"
                      className="text-gray-700 hover:text-red-400 transition-colors shrink-0">
                      {firing === emp.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 pl-3.5">
                    <span className="text-xs text-gray-500 w-20 truncate shrink-0">
                      {PROF_UA[emp.profession] ?? emp.profession}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", moodBg)} style={{ width: `${moodPct}%` }} />
                    </div>
                    <span className={cn("text-xs font-mono w-9 text-right shrink-0", moodTxt)}>{moodPct}%</span>
                  </div>
                  <div className="pl-3.5 mt-0.5">
                    <span className="text-xs text-gray-600 font-mono">
                      ₴{(emp.salaryUah / 1000).toFixed(0)}к/міс · {Math.round(emp.efficiency * 100)}% ефект.
                    </span>
                  </div>
                  <div className="pl-3.5 mt-1">
                    <select
                      value={emp.workshopId ?? ""}
                      onChange={e => reassign(emp.id, e.target.value || null)}
                      className="w-full text-[10px] rounded border border-gray-800 bg-gray-900 px-1.5 py-1 text-gray-400 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">— без цеху —</option>
                      {enterprise.workshops.map(ws => (
                        <option key={ws.id} value={ws.id}>{ws.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {employees.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-800 bg-gray-900/30 shrink-0">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">ФОП / тік</span>
            <span className="font-mono text-orange-400">{formatUAH(stats.salaryPerTick)}</span>
          </div>
          <div className="flex justify-between text-[11px] mt-0.5">
            <span className="text-gray-500">Ефективність</span>
            <span className={cn("font-mono", stats.avgEfficiency >= 0.7 ? "text-emerald-400" : "text-amber-400")}>
              {Math.round(stats.avgEfficiency * 100)}%
            </span>
          </div>
        </div>
      )}

      {hireModal && (
        <HireModal
          enterpriseId={enterprise.id}
          enterpriseType={enterprise.type}
          workshops={enterprise.workshops}
          onHired={() => { setHireModal(false); onRefresh(); }}
          onClose={() => setHireModal(false)}
        />
      )}
    </div>
  );
}

// ─── InfoColumn (inventory + finances + type-specific for 3-col layout) ────────

function InfoColumn({
  enterprise, agroInfo, stats, logs,
}: {
  enterprise: EnterpriseData;
  agroInfo: AgroInfo | null;
  stats: { salaryPerTick: number; rentPerTick: number; avgEfficiency: number; avgMood: number };
  logs: FinancialLog[];
}) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
          <Package size={12} /> Ресурси
        </span>
      </div>

      {/* Inventory */}
      {enterprise.inventory.length === 0 ? (
        <div className="px-3 py-4 text-center text-gray-700 text-xs">Склад порожній</div>
      ) : (
        enterprise.inventory.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-gray-800/60 hover:bg-gray-800/20">
            <span className="text-sm w-5 text-center shrink-0">{productEmoji(item.product.sku)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-white truncate">{item.product.nameUa}</p>
              <p className="text-xs text-gray-600 font-mono">{item.product.sku}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-mono text-white">
                {item.quantity >= 1000 ? `${(item.quantity / 1000).toFixed(1)}к` : formatNumber(item.quantity)}
              </p>
              <p className="text-xs text-gray-600">{item.product.unit}</p>
            </div>
          </div>
        ))
      )}

      {/* Cost summary */}
      <div className="mx-2 mt-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Витрати / тік</p>
        {[
          { l: "ФОП",    v: formatUAH(stats.salaryPerTick),                        c: "text-red-400" },
          { l: "Оренда", v: formatUAH(stats.rentPerTick),                           c: "text-red-400" },
          { l: "Разом",  v: formatUAH(stats.salaryPerTick + stats.rentPerTick),    c: "text-orange-300" },
        ].map(({ l, v, c }) => (
          <div key={l} className={cn("flex justify-between items-center py-0.5", l === "Разом" ? "border-t border-gray-800 mt-1 pt-1" : "")}>
            <span className="text-[11px] text-gray-500">{l}</span>
            <span className={cn("text-[11px] font-mono", c)}>−{v}</span>
          </div>
        ))}
      </div>

      {/* Agro block */}
      {enterprise.type === "AGRO_FARM" && agroInfo && (
        <div className="mx-2 mt-2 rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-3">
          <p className="text-xs text-emerald-500 font-semibold uppercase tracking-wider mb-2">Агро</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Ґрунт</span>
              <span className={cn("font-mono",
                agroInfo.soilQuality >= 7 ? "text-emerald-400" :
                agroInfo.soilQuality >= 4 ? "text-amber-400" : "text-red-400"
              )}>{agroInfo.soilQuality.toFixed(1)}/10</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full",
                agroInfo.soilQuality >= 7 ? "bg-emerald-500" :
                agroInfo.soilQuality >= 4 ? "bg-amber-500" : "bg-red-500"
              )} style={{ width: `${(agroInfo.soilQuality / 10) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Сезон</span>
              <span className={cn(
                agroInfo.seasonIndex === 0 ? "text-emerald-400" :
                agroInfo.seasonIndex === 1 ? "text-yellow-400" :
                agroInfo.seasonIndex === 2 ? "text-orange-400" : "text-blue-400"
              )}>{agroInfo.currentSeason}</span>
            </div>
            {agroInfo.recommendedCropSku && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Рекомендовано</span>
                <span className="text-emerald-400 font-mono text-xs">{agroInfo.recommendedCropSku} +15%</span>
              </div>
            )}
            {agroInfo.lastCropSku && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Остання культура</span>
                <span className="text-gray-400 font-mono text-xs">{agroInfo.lastCropSku}</span>
              </div>
            )}
            {agroInfo.intercroppingBonus && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Сумісні посіви ({agroInfo.intercroppingBonus.partnerCropSku})</span>
                <span className="text-emerald-400 font-mono text-xs">+{(agroInfo.intercroppingBonus.bonusPct * 100).toFixed(0)}%</span>
              </div>
            )}
            {[['WHEAT',[1.0,0.8,0.15,0.0]],['SUNFL',[0.2,1.0,0.75,0.0]],['MILK',[1.0,0.9,1.0,0.75]]].map(([name, mults]) => (
              <div key={name as string} className="flex justify-between text-xs">
                <span className="text-gray-600">{name as string} ×</span>
                <span className={cn("font-mono",
                  (mults as number[])[agroInfo.seasonIndex] >= 0.8 ? "text-emerald-400" :
                  (mults as number[])[agroInfo.seasonIndex] >= 0.3 ? "text-amber-400" : "text-red-400"
                )}>{((mults as number[])[agroInfo.seasonIndex] * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Licenses */}
      {enterprise.licenses.length > 0 && (
        <div className="mx-2 mt-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-1.5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ліцензії та сертифікати</p>
          {enterprise.licenses.map(lic => {
            const isActive = lic.status === "ACTIVE";
            const BADGE: Record<string, { label: string; icon: string; color: string }> = {
              ORGANIC_CERT:    { label: "Органік ×1.8 ціна +15% субсидія", icon: "🌿", color: isActive ? "text-emerald-400 border-emerald-800/40 bg-emerald-950/30" : "text-gray-500 border-gray-800 bg-gray-900" },
              AGRO_INSURANCE:  { label: "Агрострахування: виплата при НС",  icon: "🛡️", color: isActive ? "text-blue-400 border-blue-800/40 bg-blue-950/30"     : "text-gray-500 border-gray-800 bg-gray-900" },
              AGRO_PERMIT:     { label: "Агро-дозвіл",                       icon: "📋", color: isActive ? "text-amber-400 border-amber-800/40 bg-amber-950/30"   : "text-gray-500 border-gray-800 bg-gray-900" },
            };
            const b = BADGE[lic.type] ?? { label: lic.type, icon: "📄", color: "text-gray-400 border-gray-800 bg-gray-900" };
            const ticksLeft = isActive && lic.expiresAtTick != null && agroInfo?.tickNumber != null
              ? Number(lic.expiresAtTick) - agroInfo.tickNumber
              : null;
            return (
              <div key={lic.id} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5", b.color)}>
                <span className="text-sm shrink-0">{b.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{b.label}</p>
                  <p className="text-xs text-gray-600">
                    {isActive ? "Активна" : "Неактивна"}
                    {ticksLeft !== null && (
                      <span className={ticksLeft <= 30 ? "text-amber-500" : undefined}>
                        {" "}· спливає через {Math.max(0, ticksLeft)} тіків
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          {enterprise.type === "AGRO_FARM" && !enterprise.licenses.some(l => l.type === "ORGANIC_CERT" && l.status === "ACTIVE") && (
            <a href="/enterprises/licenses" className="block text-xs text-gray-600 hover:text-emerald-400 transition-colors">+ Отримати Organic Cert (₴40K)</a>
          )}
          {enterprise.type === "AGRO_FARM" && !enterprise.licenses.some(l => l.type === "AGRO_INSURANCE" && l.status === "ACTIVE") && (
            <a href="/enterprises/licenses" className="block text-xs text-gray-600 hover:text-blue-400 transition-colors">+ Оформити страхування (₴5K)</a>
          )}
        </div>
      )}
      {enterprise.type === "AGRO_FARM" && enterprise.licenses.length === 0 && (
        <div className="mx-2 mt-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ліцензії</p>
          <p className="text-xs text-gray-600">Немає активних ліцензій</p>
          <a href="/enterprises/licenses" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">+ Organic Cert / Страхування</a>
        </div>
      )}

      {/* Seasonal Planner (AGRO_FARM only) */}
      {enterprise.type === "AGRO_FARM" && agroInfo && (
        <div className="mx-2 mt-2">
          <SeasonalPlanner
            tickNumber={agroInfo.tickNumber}
            seasonIndex={agroInfo.seasonIndex}
            currentCropSku={enterprise.workshops[0]?.productionOrders?.[0]?.recipe?.outputs?.[0]?.product?.sku ?? null}
          />
        </div>
      )}

      {/* Energy */}
      <div className="mx-2 mt-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          {enterprise.energySourceType === "SOLAR_AUTONOMOUS"
            ? <Leaf size={11} className="text-emerald-400" />
            : <Zap size={11} className="text-yellow-400" />}
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            {enterprise.energySourceType === "GRID" ? "Міська мережа" :
             enterprise.energySourceType === "SOLAR_AUTONOMOUS" ? "СЕС" : "Генератор"}
          </p>
        </div>
        <div className="space-y-0.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Тариф</span>
            <span className="font-mono text-gray-300">{Number(enterprise.landPlot.energyTariffUah).toFixed(2)} ₴/кВт</span>
          </div>
          {enterprise.batteryCapacityKwh > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Батарея</span>
              <span className="font-mono text-gray-300">
                {enterprise.currentBatteryKwh.toFixed(1)}/{enterprise.batteryCapacityKwh} кВт·год
              </span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Оренда/міс</span>
            <span className="font-mono text-gray-300">{formatUAH(enterprise.landPlot.monthlyLeaseCostUah)}</span>
          </div>
        </div>
      </div>

      {/* Recent logs */}
      {logs.length > 0 && (
        <div className="mx-2 mt-2 mb-2 space-y-1">
          <p className="text-xs text-gray-600 uppercase tracking-wider px-1">Останні операції</p>
          {logs.slice(0, 4).map(l => (
            <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-800">
              <span className={cn("text-xs font-mono shrink-0 w-16 text-right",
                l.amountUah > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {l.amountUah > 0 ? "+" : "−"}{formatUAH(Math.abs(l.amountUah))}
              </span>
              <span className="text-xs text-gray-500 truncate">{l.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function EnterpriseDetailClient({ enterpriseId, initialTab }: Props) {
  const PRIMARY_TABS: Tab[] = ["management", "workshops", "hr", "warehouse"];
  const initSec = initialTab && !PRIMARY_TABS.includes(initialTab) ? initialTab : null;
  const [secSection, setSecSection] = useState<string | null>(initSec);
  const [data, setData] = useState<{
    enterprise: EnterpriseData;
    agroInfo: AgroInfo | null;
    stats: { salaryPerTick: number; rentPerTick: number; avgEfficiency: number; avgMood: number };
    logs: FinancialLog[];
    productionLogs: { tickNumber: string; unitsProduced: number; avgQuality: number }[];
  } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState(false);
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
  const freeArea = enterprise.totalFloorAreaM2 - enterprise.usedFloorAreaM2;

  async function toggleOperational() {
    setToggling(true);
    await fetch(`/api/enterprises/${enterpriseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isOperational: !enterprise.isOperational }),
    });
    setToggling(false);
    load();
  }

  const secondarySections: { key: string; label: string; emoji: string }[] = [
    { key: "supply",    label: "Постачання",    emoji: "🚚" },
    ...(enterprise.type === "RETAIL_STORE"   ? [{ key: "showcase",  label: "Вітрина",        emoji: "🏪" }] : []),
    ...(enterprise.type === "AGRO_FARM"      ? [
      { key: "fields",    label: "Поля та оренда",  emoji: "🌾" },
      { key: "machinery", label: "Техніка",         emoji: "🚜" },
      { key: "livestock", label: "Тваринництво",    emoji: "🐄" },
    ] : []),
    ...(enterprise.type === "LOGISTICS_HUB"  ? [{ key: "freight",   label: "Вантаж",          emoji: "🚛" }] : []),
    { key: "b2b",       label: "B2B",              emoji: "🔗" },
    { key: "staff",     label: "Кваліфікація",     emoji: "📚" },
    { key: "expand",    label: "Розширення",        emoji: "🔧" },
    { key: "finance",   label: "Фінанси",           emoji: "📊" },
    { key: "info",      label: "Деталі",            emoji: "ℹ️" },
  ];

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Назад" className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white truncate">{enterprise.name}</h1>
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 shrink-0">
                <CheckCircle2 size={10} /> Активне
              </span>
            ) : (
              <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5 shrink-0">Неактивне</span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{enterprise.landPlot.city.nameUa} · {enterprise.type}</p>
        </div>
        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <span className="text-gray-600">Цехів: <span className="text-white font-mono">{enterprise.workshops.length}</span></span>
          <span className="text-gray-600">Прац.: <span className="text-white font-mono">{enterprise.employees.length}</span></span>
          <span className="text-gray-600">Ефект.: <span className={cn("font-mono", stats.avgEfficiency >= 0.7 ? "text-emerald-400" : "text-amber-400")}>{Math.round(stats.avgEfficiency * 100)}%</span></span>
          <span className="text-gray-600">Витрати: <span className="text-orange-400 font-mono">{formatUAH(stats.salaryPerTick + stats.rentPerTick)}/тік</span></span>
        </div>
        {/* Pause/Resume */}
        {!enterprise.isSeized && !enterprise.isFrozenByInspection && !enterprise.isLegallyFrozen && (
          <button onClick={toggleOperational} disabled={toggling}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 border",
              enterprise.isOperational
                ? "bg-amber-900/40 text-amber-300 hover:bg-amber-800/40 border-amber-800/30"
                : "bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/40 border-emerald-800/30",
            )}>
            {toggling && <Loader2 size={11} className="animate-spin" />}
            {enterprise.isOperational ? "Пауза" : "Запустити"}
          </button>
        )}
      </div>

      {/* ── Freeze warnings ── */}
      {(enterprise.isSeized || enterprise.isFrozenByInspection || enterprise.isLegallyFrozen) && (
        <div className="space-y-1.5">
          {enterprise.isSeized && <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm"><AlertCircle size={14} /> Підприємство вилучено</div>}
          {enterprise.isFrozenByInspection && <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm"><AlertTriangle size={14} /> Заморожено інспекцією</div>}
          {enterprise.isLegallyFrozen && <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm"><AlertTriangle size={14} /> Судовий арешт {enterprise.legalFreezeReason ? `— ${enterprise.legalFreezeReason}` : ""}</div>}
        </div>
      )}

      {/* ── 3-column layout ── */}
      <div className="rounded-xl border border-gray-800 overflow-hidden" style={{ height: 660 }}>
        <div className="flex h-full">

          {/* Col 1 — Workshops (50%) */}
          <div className="w-1/2 border-r border-gray-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/50 shrink-0">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <Factory size={12} /> Виробництво · {enterprise.workshops.length} цехів
              </span>
              <span className="text-[11px] text-gray-600">{freeArea.toFixed(0)} м² вільно</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <WorkshopsTab enterprise={enterprise} onRefresh={load} agroInfo={agroInfo} />
            </div>
          </div>

          {/* Col 2 — Team (25%) */}
          <div className="w-1/4 border-r border-gray-800 overflow-y-auto flex flex-col">
            <TeamColumn enterprise={enterprise} stats={stats} onRefresh={load} />
          </div>

          {/* Col 3 — Info/Inventory (25%) */}
          <div className="w-1/4 overflow-y-auto flex flex-col">
            <InfoColumn enterprise={enterprise} agroInfo={agroInfo} stats={stats} logs={logs} />
          </div>
        </div>
      </div>

      {/* ── Secondary section nav ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {secondarySections.map(s => (
          <button key={s.key} onClick={() => setSecSection(secSection === s.key ? null : s.key)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              secSection === s.key
                ? "bg-emerald-900/30 text-emerald-400 border-emerald-800/40"
                : "text-gray-500 border-gray-800 bg-gray-900 hover:text-gray-300 hover:border-gray-700",
            )}>
            <span>{s.emoji}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Secondary content ── */}
      {secSection === "supply"    && <SupplyTab enterpriseId={enterpriseId} />}
      {secSection === "showcase"  && <ShowcaseTab enterpriseId={enterpriseId} onGoToSupply={() => setSecSection("supply")} />}
      {secSection === "fields"    && <FieldsTab enterprise={enterprise} agroInfo={agroInfo} onRefresh={load} />}
      {secSection === "machinery" && <MachineryTab enterpriseId={enterpriseId} />}
      {secSection === "livestock" && <LivestockTab enterpriseId={enterpriseId} employees={enterprise.employees} />}
      {secSection === "freight"   && <FreightTab enterpriseId={enterpriseId} />}
      {secSection === "b2b"       && <B2bTab enterpriseId={enterpriseId} />}
      {secSection === "staff"     && <StaffTab enterpriseId={enterpriseId} />}
      {secSection === "expand"    && <ExpandTab enterpriseId={enterpriseId} enterpriseType={enterprise.type} />}
      {secSection === "finance"   && <LogsTab logs={logs} />}
      {secSection === "info"      && (
        <ManagementTab
          enterprise={enterprise}
          stats={stats}
          productionLogs={productionLogs}
          onToggleOperational={async (val) => {
            await fetch(`/api/enterprises/${enterpriseId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isOperational: val }),
            });
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── FreightTab ───────────────────────────────────────────────────────────────
