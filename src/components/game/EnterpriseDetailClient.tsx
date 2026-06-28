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
import { QualityStars } from "@/components/game/QualityBar";
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

type Tab = "management" | "workshops" | "hr" | "warehouse" | "production" | "supply" | "showcase" | "fields" | "staff" | "expand" | "machinery" | "livestock" | "freight" | "b2b";

interface Props { enterpriseId: string; initialTab?: Tab; title?: string }

interface Employee {
  id: string; firstName: string; lastName: string; profession: string;
  salaryUah: number; mood: number; efficiency: number;
  isOnStrike: boolean; hiredAt: string; accruedSalaryUah: number;
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

interface Workshop {
  id: string; name: string; footprintM2: number; maxCapacity: number;
  currentVolume: number; isActive: boolean; harvestAccumulated: number;
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
  soilQuality:         number;
  lastCropSku:         string | null;
  fertilizerTicksLeft: number;
  pestDamageMult:      number;
  recommendedCropSku:  string | null;
  currentSeason:       string;
  seasonIndex:         number;
  tickNumber:          number;
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
  VETERINARIAN: "Ветеринар",
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

const RECIPE_UA: Record<string, string> = {
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
                  <p className="text-sm font-semibold text-white">{RECIPE_UA[r.name] ?? r.name}</p>
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
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-white whitespace-nowrap z-10">
                      День {tick}: {formatNumber(Math.round(val))} од.
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>День {ticks[0]?.[0]}</span>
              <span>День {ticks[ticks.length - 1]?.[0]}</span>
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

const MACHINERY_YIELD_BONUS_UI: Record<string, number> = {
  TRACTOR: 20, COMBINE_HARVESTER: 30, SEEDER: 10, SPRAYER: 5,
};
const MACHINERY_EMOJI_UI: Record<string, string> = {
  TRACTOR: "🚜", COMBINE_HARVESTER: "🌾", SEEDER: "🌱", SPRAYER: "💧",
};
const AGRO_SEASON_MULTS_UI: Record<string, [number, number, number, number]> = {
  'RM-WHEAT':      [1.0, 0.8, 0.15, 0.0],
  'RM-SUNFL':      [0.2, 1.0, 0.75, 0.0],
  'RM-SUGBEET':    [0.4, 0.8, 1.0,  0.0],
  'RM-CORN':       [0.3, 1.0, 0.80, 0.0],
  'RM-MILK':       [1.0, 0.9, 1.0,  0.75],
  'RM-LIVESTOCK':  [1.0, 1.0, 1.0,  0.80],
  'SF-COMPOST':    [1.0, 1.0, 1.0,  1.00],
};

function WorkshopsTab({
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

  useEffect(() => {
    if (enterprise.type !== "AGRO_FARM") return;
    fetch(`/api/enterprises/${enterprise.id}/machinery`)
      .then(r => r.json())
      .then(d => setMachinery(d.machinery ?? []))
      .catch(() => {});
    fetch(`/api/enterprises/${enterprise.id}/livestock`)
      .then(r => r.json())
      .then(d => setLivestock(d.herds ?? []))
      .catch(() => {});
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

  async function doAgroAction(action: "fertilize" | "pesticide") {
    setAgroActing(action);
    setAgroMsg("");
    const url = action === "fertilize" ? "/api/agro/fertilize" : "/api/agro/pesticide";
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterpriseId: enterprise.id }),
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
            const hasHarvest = w.harvestAccumulated >= 0.1 && isField;

            return (
              <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {SKU_EMOJI[cropSku ?? ''] ?? "🌿"} {w.name}
                      <span className="ml-2 text-xs text-gray-500 font-normal">{w.footprintM2} м²</span>
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {cropName ? (RECIPE_UA[activeOrder?.recipe?.name ?? ''] ?? cropName) : <span className="text-amber-400">Культуру не призначено</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {brokenCount > 0 && <span className="text-[10px] text-red-400 bg-red-500/10 rounded px-1.5 py-0.5"><Hammer size={9} className="inline mr-0.5" />{brokenCount}</span>}
                    <span className={cn("text-[10px] rounded-full px-2 py-0.5", w.isActive ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 bg-gray-800")}>
                      {w.isActive ? "Активне" : "Зупинено"}
                    </span>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {/* Soil + Season row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded bg-gray-800/50 px-2 py-1.5 space-y-1">
                      <p className="text-[9px] text-gray-500 uppercase tracking-wider">Ґрунт</p>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full bg-gray-700">
                          <div className={cn("h-full rounded-full", soilQ >= 7 ? "bg-emerald-500" : soilQ >= 4 ? "bg-amber-500" : "bg-red-500")}
                            style={{ width: `${(soilQ / 10) * 100}%` }} />
                        </div>
                        <span className={cn("text-xs font-mono", soilQ >= 7 ? "text-emerald-400" : soilQ >= 4 ? "text-amber-400" : "text-red-400")}>{soilQ.toFixed(1)}/10</span>
                      </div>
                      {fertLeft > 0
                        ? <p className="text-[9px] text-emerald-400">🌱 +20% добриво · {Math.ceil(fertLeft / 30)} сез</p>
                        : <p className="text-[9px] text-gray-600">Без добрива</p>}
                      {pestDmg < 1.0 && <p className="text-[9px] text-red-400">🐛 Шкідники −{Math.round((1 - pestDmg) * 100)}%</p>}
                    </div>
                    <div className="rounded bg-gray-800/50 px-2 py-1.5 space-y-1">
                      <p className="text-[9px] text-gray-500 uppercase tracking-wider">Сезон</p>
                      <p className={cn("text-xs font-medium", seasonMult === 0 ? "text-red-400" : seasonMult >= 0.8 ? "text-emerald-400" : "text-amber-400")}>
                        {seasonName} · {Math.round(seasonMult * 100)}%
                      </p>
                      {rotStatus === 'optimal' && <p className="text-[9px] text-emerald-400">✓ Ротація +15%</p>}
                      {rotStatus === 'mono'    && <p className="text-[9px] text-red-400">✗ Монокультура −15%</p>}
                      {rotStatus === 'neutral' && lastCrop && <p className="text-[9px] text-gray-500">Рек.: {SKU_EMOJI[ROTATION_NEXT_UI[lastCrop] ?? ''] ?? ''} {ROTATION_NEXT_UI[lastCrop]}</p>}
                    </div>
                  </div>

                  {/* Yield formula */}
                  {cropSku && (
                    <div className="rounded bg-gray-800/40 px-2 py-1.5 space-y-1">
                      <div className="flex items-center flex-wrap gap-1 text-[10px]">
                        <span className="font-mono text-white">{w.footprintM2} м²</span>
                        <span className="text-gray-600">×</span>
                        <span className={soilMult >= 0.85 ? "text-emerald-400" : soilMult >= 0.5 ? "text-amber-400" : "text-red-400"}>ґрунт {Math.round(soilMult * 100)}%</span>
                        <span className="text-gray-600">×</span>
                        <span className={seasonMult === 0 ? "text-red-400" : seasonMult >= 0.8 ? "text-emerald-400" : "text-amber-400"}>сезон {Math.round(seasonMult * 100)}%</span>
                        {machBonus > 0 && <>
                          <span className="text-gray-600">×</span>
                          <span className="text-emerald-400">техніка ×{machMult.toFixed(2)}</span>
                        </>}
                        <span className="text-gray-600">=</span>
                        <span className={cn("font-semibold", estYield > 0 ? "text-white" : "text-red-400")}>
                          {estYield > 0 ? `~${estYield.toFixed(1)}/тік` : "0 — позасезонно"}
                        </span>
                      </div>
                      {activeMach.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {activeMach.map((m: any) => (
                            <span key={m.id} className="text-[9px] bg-emerald-900/30 text-emerald-400 px-1 py-0.5 rounded">
                              {MACHINERY_EMOJI_UI[m.type] ?? "⚙️"} +{MACHINERY_YIELD_BONUS_UI[m.type] ?? 0}%
                            </span>
                          ))}
                        </div>
                      )}
                      {activeMach.length === 0 && <p className="text-[9px] text-amber-600">⚠ Немає активної техніки — додайте у вкладці Техніка</p>}
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
                      {activeOrder && <p className="text-[10px] text-gray-500 mt-0.5">{activeOrder.completedQuantity.toFixed(0)} / {activeOrder.targetQuantity >= 999_000 ? "∞" : activeOrder.targetQuantity} вироблено</p>}
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
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider">Обладнання цеху</p>
                      <button onClick={() => setBuyEquipWs(w)} className="text-[9px] text-emerald-400 hover:text-emerald-300">+ Купити</button>
                    </div>
                    {w.equipment.length === 0 && (
                      <p className="text-[10px] text-amber-500">⚠ Без обладнання — виробництво неможливе</p>
                    )}
                    {w.equipment.map(eq => {
                      const busy = equipBusy === eq.id;
                      const msg  = equipMsg?.id === eq.id ? equipMsg : null;
                      return (
                        <div key={eq.id}>
                          <div className="flex items-center gap-2 text-[10px]">
                            <Cpu size={10} className="text-gray-600 shrink-0" />
                            <span className="flex-1 text-gray-400 truncate">{eq.nameUa ?? eq.name}</span>
                            <div className="w-12 shrink-0"><WearBar value={eq.wearAndTear} /></div>
                            <span className={cn("shrink-0", STATUS_COLOR[eq.status] ?? "text-gray-400")}>{STATUS_UA[eq.status] ?? eq.status}</span>
                            {eq.isBroken ? (
                              <button onClick={() => doEquipAction(eq.id, "repair")} disabled={busy}
                                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50">
                                {busy ? <Loader2 size={9} className="animate-spin" /> : "Рем."}
                              </button>
                            ) : (eq.status === "WORN" || eq.wearAndTear > 0.3) ? (
                              <button onClick={() => doEquipAction(eq.id, "maintenance")} disabled={busy}
                                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50">
                                {busy ? <Loader2 size={9} className="animate-spin" /> : "ТО"}
                              </button>
                            ) : null}
                          </div>
                          {msg && <p className={cn("text-[9px] mt-0.5 pl-4", msg.ok ? "text-emerald-400" : "text-red-400")}>{msg.text}</p>}
                        </div>
                      );
                    })}
                  </div>

                  {/* FarmMachinery panel */}
                  {machinery.length > 0 && (
                    <div className="pt-1.5 border-t border-gray-800 space-y-1">
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider">Техніка підприємства</p>
                      {machinery.map((m: any) => {
                        const dur = m.durability ?? 1;
                        const isBroken = !m.isOperational || dur <= 0;
                        const isWorn   = dur < 0.3 && !isBroken;
                        return (
                          <div key={m.id} className="flex items-center gap-2 text-[10px]">
                            <span className="shrink-0">{MACHINERY_EMOJI_UI[m.type] ?? "⚙️"}</span>
                            <span className="flex-1 text-gray-400 truncate">{m.nameUa ?? m.type}</span>
                            <div className="w-12 shrink-0 h-1 rounded-full bg-gray-700">
                              <div className={cn("h-full rounded-full", dur > 0.5 ? "bg-emerald-500" : dur > 0.2 ? "bg-amber-500" : "bg-red-500")}
                                style={{ width: `${Math.max(0, dur * 100)}%` }} />
                            </div>
                            <span className={cn("shrink-0 text-[9px]", isBroken ? "text-red-400" : isWorn ? "text-amber-400" : "text-emerald-400")}>
                              {isBroken ? "Зламано" : isWorn ? "Зношено" : `${Math.round(dur * 100)}%`}
                            </span>
                            {(isBroken || isWorn) && (
                              <button onClick={() => repairMachinery(m.id)} disabled={machRepBusy === m.id}
                                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-white transition-colors disabled:opacity-50">
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
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider">Стадо</p>
                      {livestock.length === 0 ? (
                        <p className="text-[10px] text-red-400">⚠ Немає стада — виробництво неможливе</p>
                      ) : livestock.map((h: any) => {
                        const hp  = h.health ?? 1;
                        const skipped = h.feedSkippedTicks ?? 0;
                        return (
                          <div key={h.id} className="flex items-center gap-2 text-[10px]">
                            <span className="shrink-0">{SPECIES_UA[h.species] ?? h.species}</span>
                            <span className="text-gray-500">{h.headCount} гол.</span>
                            <div className="flex-1 h-1 rounded-full bg-gray-700">
                              <div className={cn("h-full rounded-full", hp >= 0.7 ? "bg-emerald-500" : hp >= 0.4 ? "bg-amber-500" : "bg-red-500")}
                                style={{ width: `${hp * 100}%` }} />
                            </div>
                            <span className={cn("shrink-0 font-mono", hp >= 0.7 ? "text-emerald-400" : hp >= 0.4 ? "text-amber-400" : "text-red-400")}>
                              {Math.round(hp * 100)}%
                            </span>
                            {skipped > 0 && <span className="text-[9px] text-red-400">😟 −{skipped}тік корму</span>}
                          </div>
                        );
                      })}
                      {avgHealth !== null && avgHealth < 0.5 && (
                        <p className="text-[9px] text-red-400">⚠ Здоров'я &lt;50% — продуктивність впала. Поповніть RM-CORN.</p>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-1.5 pt-1.5 border-t border-gray-800 flex-wrap">
                    <button onClick={() => doAgroAction("fertilize")} disabled={!!agroActing || fertLeft > 0}
                      className="text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 font-medium disabled:opacity-40 transition-colors">
                      {agroActing === "fertilize" ? <Loader2 size={10} className="animate-spin" /> : "🌱 Удобрити"}
                    </button>
                    <button onClick={() => doAgroAction("pesticide")} disabled={!!agroActing || pestDmg >= 1.0}
                      className="text-xs rounded-lg bg-orange-700 hover:bg-orange-600 text-white px-2.5 py-1.5 font-medium disabled:opacity-40 transition-colors">
                      {agroActing === "pesticide" ? <Loader2 size={10} className="animate-spin" /> : "🐛 Пестицид"}
                    </button>
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
                  {vol === 0 ? (
                    <p className="text-[10px] text-red-400 mt-1">⛔ Виробництво зупинено (обсяг = 0)</p>
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
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
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
                                <span key={m.id} className="text-[9px] bg-emerald-900/40 text-emerald-400 px-1 rounded">
                                  {MACHINERY_EMOJI_UI[m.type] ?? "⚙️"} +{MACHINERY_YIELD_BONUS_UI[m.type] ?? 0}%
                                </span>
                              ))}
                            </div>
                          )}
                          {activeMach.length === 0 && (
                            <p className="text-[9px] text-amber-600">⚠ Немає активної техніки</p>
                          )}
                        </div>
                        {isCapped && (
                          <p className="text-[10px] text-amber-500">⚠ Ліміт {vol} обмежує фактичний врожай {estYield.toFixed(0)} — підвищте ліміт</p>
                        )}
                      </div>
                    );
                  })() : (
                    <p className="text-[10px] text-gray-600 mt-1">Ліміт {vol} од/тік. Фактичне виробництво = min(ліміт, пропускна здатність обладнання, запас матеріалів).</p>
                  )}
                </div>

                {/* Recipe / Production Order */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Рецепт / продукт</p>
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
                            <span className="flex-1 text-gray-300 truncate">{eq.nameUa ?? eq.name}</span>
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

// ─── CreateFieldPlot (inline form when no workshops exist) ────────────────────
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
  const ticks = Math.max(2, Math.ceil(parseFloat(areaM2 || "0") / 50));
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
              <label className="text-[10px] text-gray-500 mb-1 block">Що вирощувати</label>
              <select value={recipeId} onChange={e => setRecipeId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-green-500">
                {recipes.map(r => {
                  const out = r.outputs[0];
                  return <option key={r.id} value={r.id}>{out ? `${SKU_EMOJI[out.product.sku] ?? "🌿"} ${out.product.nameUa}` : r.name}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Площа ділянки (м²)</label>
              <input type="number" min="100" step="100"
                max={freeLandM2 != null ? freeLandM2 : undefined}
                value={areaM2} onChange={e => setAreaM2(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <div className="flex flex-col justify-end pb-0.5 gap-0.5">
              <p className="text-[10px] text-gray-500">Вартість: <span className="text-white font-mono">₴{cost.toLocaleString()}</span></p>
              <p className="text-[10px] text-gray-500">Будівництво: <span className="text-white">{ticks} тік{ticks === 1 ? "" : "и"}</span></p>
            </div>
          </div>
          {selectedRecipe && (
            <p className="text-[10px] text-emerald-500">
              {SKU_EMOJI[selectedRecipe.outputs[0]?.product.sku ?? ""] ?? "🌿"} Після будівництва ділянка автоматично засіватиметься {selectedRecipe.outputs[0]?.product.nameUa ?? ""}
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

// ─── Fields Tab (AGRO_FARM) ────────────────────────────────────────────────────
const ROTATION_NEXT_UI: Record<string, string> = {
  'RM-WHEAT': 'RM-SUNFL', 'RM-SUNFL': 'RM-SUGBEET', 'RM-SUGBEET': 'RM-WHEAT', 'RM-CORN': 'RM-WHEAT',
};
const FIELD_CROPS_UI = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);

function FieldsTab({ enterprise, agroInfo, onRefresh }: { enterprise: EnterpriseData; agroInfo: AgroInfo | null; onRefresh: () => void }) {
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
                className="ml-1 px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-[10px] font-medium disabled:opacity-50"
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
              className="ml-1 px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-medium disabled:opacity-50"
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
              <p className="text-[10px] text-gray-600 mt-0.5">
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
                  <span className="shrink-0 text-[10px] text-gray-500 font-mono">{ws.footprintM2.toLocaleString()} м²</span>
                </div>
                {cropSku ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{cropName}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{cropSku}</p>
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
                    {rotationStatus === 'optimal' && <p className="text-[10px] text-emerald-400">✓ Оптимальна ротація +15%</p>}
                    {rotationStatus === 'mono' && nextRecommended && (
                      <p className="text-[10px] text-red-400">✗ Монокультура −15% · краще: {SKU_EMOJI[nextRecommended] ?? ""} {nextRecommended}</p>
                    )}
                    {rotationStatus === 'neutral' && nextRecommended && (
                      <p className="text-[10px] text-gray-500">Рекомендовано: {SKU_EMOJI[nextRecommended] ?? ""} {nextRecommended}</p>
                    )}
                    {estYield !== null && (
                      <div className="mt-1 border-t border-gray-800 pt-1.5">
                        {estYield === 0 || seasonMult === 0 ? (
                          <p className="text-[10px] text-red-400">Врожай: 0 — позасезонно</p>
                        ) : (
                          <p className="text-[10px] text-gray-400">
                            Врожай ~<span className="text-white font-mono">{estYield.toFixed(1)}</span>
                            {cropUnit ? ` ${cropUnit}` : ""}/тік
                            <span className="text-gray-600 ml-1">({ws.footprintM2} м² · ґрунт {(soilMult * 100).toFixed(0)}%)</span>
                          </p>
                        )}
                      </div>
                    )}
                    {ws.harvestAccumulated >= 0.1 && FIELD_CROPS_UI.has(cropSku ?? '') && (
                      <div className="mt-1.5 border-t border-amber-900/40 pt-1.5 flex items-center justify-between">
                        <p className="text-[10px] text-amber-300">
                          🌾 Готово до збору: <span className="font-mono font-bold">{ws.harvestAccumulated.toFixed(1)}</span> {cropUnit ?? "кг"}
                        </p>
                        <button
                          onClick={() => harvestWorkshop(ws.id)}
                          disabled={harvestBusy === ws.id}
                          className="px-2 py-0.5 text-[10px] rounded bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50"
                        >
                          {harvestBusy === ws.id ? "..." : "Зібрати →"}
                        </button>
                      </div>
                    )}
                    <button onClick={() => setRecipeModal(ws)} className="text-[10px] text-blue-400 hover:text-blue-300 underline underline-offset-2">
                      Змінити культуру
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Ділянка порожня — оберіть, що посіяти</p>
                    {nextRecommended && (
                      <p className="text-[10px] text-emerald-500">Рекомендовано: {SKU_EMOJI[nextRecommended] ?? ""} {nextRecommended}</p>
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
              <label className="block text-[10px] text-gray-500 mb-1">Додати поле (м²) · ₴{fieldInfo.setupCostPerM2}/м² разово + ₴{fieldInfo.rentPerM2PerMonth}/м²/міс</label>
              <input type="number" min="100" step="100" value={expandArea} onChange={e => setExpandArea(e.target.value)}
                placeholder="напр. 500"
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
        <p className="text-xs font-semibold text-amber-400">Ф'ючерси (фіксована ціна продажу)</p>

        {/* Активні контракти */}
        {contracts.length > 0 ? (
          <div className="space-y-1.5">
            {contracts.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs border border-gray-800 rounded p-2">
                <div>
                  <span className="font-mono text-emerald-300">{c.productSku}</span>
                  <span className="text-gray-400 ml-2">{c.quantityUnits} {c.productUnit} × ₴{c.pricePerUnit}</span>
                  <span className="text-gray-600 ml-2">= ₴{c.totalValue.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">до дня {c.deliveryTick}</span>
                  <button onClick={() => handleCancelContract(c.id)} className="text-red-500 hover:text-red-400 text-[10px]">✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Немає активних ф'ючерсів</p>
        )}

        {/* Новий ф'ючерс */}
        <div className="grid grid-cols-2 gap-2">
          <select value={newContract.productSku} onChange={e => setNewContract(p => ({ ...p, productSku: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500">
            <option value="">Оберіть культуру</option>
            {AGRO_SKUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" placeholder="Кількість" value={newContract.qty} onChange={e => setNewContract(p => ({ ...p, qty: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500" />
          <input type="number" placeholder="Ціна ₴/од" value={newContract.price} onChange={e => setNewContract(p => ({ ...p, price: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500" />
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
              <span className="text-[10px] bg-yellow-700 text-yellow-100 px-2 py-0.5 rounded-full">Відкрито сьогодні!</span>
            ) : (
              <span className="text-[10px] text-gray-500">До ярмарку: {fairInfo.nextFairIn} дн.</span>
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
          <p className="text-[10px] text-gray-500">Застава: активний ф'ючерсний контракт. Сума до 70% вартості контракту.</p>
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

// ── MachineryTab ─────────────────────────────────────────────────────────────
function MachineryTab({ enterpriseId }: { enterpriseId: string }) {
  const [data,    setData]    = useState<{ machinery: any[]; catalog: any[] } | null>(null);
  const [acting,  setActing]  = useState<string | null>(null);
  const [msg,     setMsg]     = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/enterprises/${enterpriseId}/machinery`)
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [enterpriseId]);

  const act = async (action: string, payload: object) => {
    setActing(action);
    const res  = await fetch(`/api/enterprises/${enterpriseId}/machinery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const d = await res.json();
    setMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) load();
    setActing(null);
  };

  const durColor = (d: number) => d > 0.6 ? "text-emerald-400" : d > 0.3 ? "text-amber-400" : "text-red-400";

  const MACHINERY_BONUS: Record<string, number> = {
    TRACTOR: 20, COMBINE_HARVESTER: 30, SEEDER: 10, SPRAYER: 5,
  };
  const MACHINERY_EMOJI: Record<string, string> = {
    TRACTOR: "🚜", COMBINE_HARVESTER: "🌾", SEEDER: "🌱", SPRAYER: "💧",
  };

  const activeMachinery = (data?.machinery ?? []).filter((m: any) => m.isOperational && m.durability > 0);
  const totalBonus = activeMachinery.reduce((sum: number, m: any) => sum + (MACHINERY_BONUS[m.type] ?? 0), 0);

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;

  return (
    <div className="space-y-4">
      {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}

      {/* Production impact summary */}
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Вплив на виробництво</p>
          <span className={`text-sm font-bold ${totalBonus > 0 ? "text-emerald-400" : "text-gray-500"}`}>
            {totalBonus > 0 ? `+${totalBonus}% врожайність` : "Немає активної техніки"}
          </span>
        </div>
        {activeMachinery.length > 0 ? (
          <div className="space-y-1">
            {activeMachinery.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{MACHINERY_EMOJI[m.type] ?? "⚙️"} {m.name}</span>
                <span className="text-emerald-400 font-medium">+{MACHINERY_BONUS[m.type] ?? 0}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Придбайте або орендуйте техніку щоб збільшити врожайність усіх цехів.</p>
        )}
        <p className="text-[10px] text-gray-600 mt-2">Застосовується до всіх агро-цехів підприємства кожен тік.</p>
      </div>

      {/* Existing machinery */}
      {data?.machinery && data.machinery.length > 0 && (
        <div className="space-y-2">
          {data.machinery.map((m: any) => (
            <div key={m.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{MACHINERY_EMOJI[m.type] ?? "⚙️"} {m.name}</p>
                  {m.isRented && <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">ОРЕНДА</span>}
                  {!m.isOperational && <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">ЗЛАМАНА</span>}
                  {m.isOperational && m.durability > 0 && (
                    <span className="text-[10px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded">+{MACHINERY_BONUS[m.type] ?? 0}% врожаю</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-700">
                    <div className={`h-full rounded-full ${durColor(m.durability)}`} style={{ width: `${m.durability * 100}%`, backgroundColor: "currentColor" }} />
                  </div>
                  <span className={`text-xs ${durColor(m.durability)}`}>{Math.round(m.durability * 100)}%</span>
                </div>
              </div>
              {(m.durability < 0.5 || !m.isOperational) && (
                <button onClick={() => act("repair", { machineryId: m.id })} disabled={acting === "repair"}
                  className="shrink-0 text-xs rounded-lg bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 transition-colors">
                  🔧 Ремонт
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Catalog */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Придбати / Орендувати техніку</p>
        <div className="space-y-2">
          {data?.catalog?.map((item: any) => (
            <div key={item.type} className="flex items-center gap-3 rounded-lg bg-gray-800 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{MACHINERY_EMOJI[item.type] ?? "⚙️"} {item.nameUa}</p>
                <p className="text-xs text-gray-500">
                  Купити: ₴{item.price.toLocaleString("uk-UA")} · Оренда: ₴{item.rentPerTick.toLocaleString("uk-UA")}/тік
                  <span className="ml-1 text-emerald-500">· +{Math.round(item.yieldBonus * 100)}% врожаю всіх цехів</span>
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => act(item.type, { machineryType: item.type })} disabled={!!acting}
                  className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 transition-colors">Купити</button>
                <button onClick={() => act(item.type + "_rent", { machineryType: item.type, isRent: true })} disabled={!!acting}
                  className="text-xs rounded bg-amber-700 hover:bg-amber-600 text-white px-2 py-1 transition-colors">Оренда</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LivestockTab ──────────────────────────────────────────────────────────────
function LivestockTab({ enterpriseId }: { enterpriseId: string }) {
  const [data,    setData]    = useState<{ herds: any[]; catalog: any[] } | null>(null);
  const [counts,  setCounts]  = useState<Record<string, string>>({});
  const [acting,  setActing]  = useState<string | null>(null);
  const [msgs,    setMsgs]    = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/enterprises/${enterpriseId}/livestock`)
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [enterpriseId]);

  const buy = async (species: string) => {
    const n = parseInt(counts[species] || "10");
    if (!n || n < 1) return;
    setActing(species);
    const res  = await fetch(`/api/enterprises/${enterpriseId}/livestock`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ species, headCount: n }),
    });
    const d = await res.json();
    setMsgs(prev => ({ ...prev, [species]: res.ok ? `✓ ${d.message}` : `✗ ${d.error}` }));
    if (res.ok) load();
    setActing(null);
  };

  const slaughter = async (herdId: string) => {
    if (!confirm("Відправити стадо на забій?")) return;
    setActing(herdId);
    const res  = await fetch(`/api/enterprises/${enterpriseId}/livestock`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "slaughter", herdId }),
    });
    const d = await res.json();
    if (res.ok) load(); else alert(`✗ ${d.error}`);
    setActing(null);
  };

  const healthColor = (h: number) => h > 0.7 ? "text-emerald-400" : h > 0.4 ? "text-amber-400" : "text-red-400";
  const SPECIES_UA: Record<string, string> = { CATTLE: "🐄 ВРХ", PIGS: "🐷 Свині", POULTRY: "🐔 Птиця" };

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;

  return (
    <div className="space-y-4">
      {/* Active herds */}
      {data?.herds && data.herds.length > 0 && (
        <div className="space-y-2">
          {data.herds.map((h: any) => (
            <div key={h.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{SPECIES_UA[h.species] ?? h.species} — {h.headCount} голів</p>
                  <p className={`text-xs ${healthColor(h.health)}`}>Здоров'я: {Math.round(h.health * 100)}% · Вік: {h.ageInTicks} тік(ів)
                    {h.feedSkippedTicks > 0 && <span className="ml-2 text-red-400">⚠ {h.feedSkippedTicks} тіки без корму</span>}
                  </p>
                </div>
                <button onClick={() => slaughter(h.id)} disabled={acting === h.id}
                  className="shrink-0 text-xs rounded bg-red-900/50 hover:bg-red-900/70 border border-red-700/30 text-red-400 px-2 py-1 transition-colors">
                  {acting === h.id ? "..." : "На забій"}
                </button>
              </div>
              <p className="text-xs text-gray-500">{h.config?.outputDesc}</p>
            </div>
          ))}
        </div>
      )}

      {/* Buy catalog */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Закупити худобу</p>
        <p className="text-xs text-gray-500">Корм: RM-CORN зі складу. Потрібен AGRO_PERMIT.</p>
        {data?.catalog?.map((item: any) => (
          <div key={item.species} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white">{SPECIES_UA[item.species] ?? item.species}</p>
                <p className="text-xs text-gray-500">₴{item.pricePerHead.toLocaleString("uk-UA")}/голову · {item.outputDesc}</p>
              </div>
              <div className="flex gap-1.5 items-center shrink-0">
                <input type="number" min={1} value={counts[item.species] ?? "10"}
                  onChange={e => setCounts(prev => ({ ...prev, [item.species]: e.target.value }))}
                  className="w-16 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white text-center" />
                <button onClick={() => buy(item.species)} disabled={acting === item.species}
                  className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 transition-colors">
                  {acting === item.species ? "..." : "Купити"}
                </button>
              </div>
            </div>
            {msgs[item.species] && <p className={`text-xs ${msgs[item.species].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msgs[item.species]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

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
            className="text-[10px] text-red-300 hover:text-red-200 bg-red-900/40 rounded px-2 py-0.5">
            {settling ? "…" : "Врегулювати"}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <Users size={20} className="mb-2" />
            <p className="text-xs">Немає персоналу</p>
          </div>
        ) : employees.map(emp => {
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
                  className="text-gray-700 hover:text-red-400 transition-colors shrink-0">
                  {firing === emp.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 pl-3.5">
                <span className="text-[10px] text-gray-500 w-20 truncate shrink-0">
                  {PROF_UA[emp.profession] ?? emp.profession}
                </span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", moodBg)} style={{ width: `${moodPct}%` }} />
                </div>
                <span className={cn("text-[10px] font-mono w-7 text-right shrink-0", moodTxt)}>{moodPct}%</span>
              </div>
              <div className="pl-3.5 mt-0.5">
                <span className="text-[10px] text-gray-600 font-mono">
                  ₴{(emp.salaryUah / 1000).toFixed(0)}к/міс · {Math.round(emp.efficiency * 100)}% ефект.
                </span>
              </div>
            </div>
          );
        })}
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
              <p className="text-[10px] text-gray-600 font-mono">{item.product.sku}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-mono text-white">
                {item.quantity >= 1000 ? `${(item.quantity / 1000).toFixed(1)}к` : formatNumber(item.quantity)}
              </p>
              <p className="text-[9px] text-gray-600">{item.product.unit}</p>
            </div>
          </div>
        ))
      )}

      {/* Cost summary */}
      <div className="mx-2 mt-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Витрати / тік</p>
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
          <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider mb-2">Агро</p>
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
                <span className="text-emerald-400 font-mono text-[10px]">{agroInfo.recommendedCropSku} +15%</span>
              </div>
            )}
            {agroInfo.lastCropSku && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Остання культура</span>
                <span className="text-gray-400 font-mono text-[10px]">{agroInfo.lastCropSku}</span>
              </div>
            )}
            {[['WHEAT',[1.0,0.8,0.15,0.0]],['SUNFL',[0.2,1.0,0.75,0.0]],['MILK',[1.0,0.9,1.0,0.75]]].map(([name, mults]) => (
              <div key={name as string} className="flex justify-between text-[10px]">
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

      {/* Energy */}
      <div className="mx-2 mt-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          {enterprise.energySourceType === "SOLAR_AUTONOMOUS"
            ? <Leaf size={11} className="text-emerald-400" />
            : <Zap size={11} className="text-yellow-400" />}
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
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
          <p className="text-[10px] text-gray-600 uppercase tracking-wider px-1">Останні операції</p>
          {logs.slice(0, 4).map(l => (
            <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-800">
              <span className={cn("text-[10px] font-mono shrink-0 w-16 text-right",
                l.amountUah > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {l.amountUah > 0 ? "+" : "−"}{formatUAH(Math.abs(l.amountUah))}
              </span>
              <span className="text-[10px] text-gray-500 truncate">{l.description}</span>
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
        <button onClick={() => router.back()} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0">
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
      {secSection === "livestock" && <LivestockTab enterpriseId={enterpriseId} />}
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
function FreightTab({ enterpriseId }: { enterpriseId: string }) {
  void enterpriseId;
  const [info, setInfo] = useState<{
    hasHub: boolean;
    openOrders: { id: string; productSku: string; quantityUnits: number; fromCity: string; toCity: string; totalValueUah: number; status: string }[];
    myOrders:   { id: string; productSku: string; fromCity: string; toCity: string; totalValueUah: number; status: string }[];
  } | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/logistics/freight")
      .then(r => r.ok ? r.json() : null).then(setInfo).catch(() => {});
  }, []);

  const accept = async (orderId: string) => {
    setAccepting(orderId); setMsg(null);
    const r = await fetch("/api/logistics/freight", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    setAccepting(null);
    if (r.ok) fetch("/api/logistics/freight").then(res => res.ok ? res.json() : null).then(setInfo).catch(() => {});
  };

  if (!info) return <p className="text-xs text-gray-500 p-2">Завантаження...</p>;
  return (
    <div className="space-y-4 p-1">
      {!info.hasHub && <div className="text-xs text-amber-400 border border-amber-900/40 rounded-lg p-3">Потрібен активний LOGISTICS_HUB для прийняття замовлень</div>}
      {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
      <div className="rounded-lg border border-blue-900/40 bg-blue-950/10 p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-400">Відкриті замовлення ({info.openOrders.length})</p>
        {info.openOrders.length === 0 ? <p className="text-xs text-gray-600">Немає доступних замовлень</p> : (
          <div className="space-y-1.5">
            {info.openOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs border border-gray-800 rounded p-2 gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-emerald-300">{o.productSku}</span>
                  <span className="text-gray-400 ml-2">{o.quantityUnits} од.</span>
                  <span className="text-gray-600 ml-2">{o.fromCity} → {o.toCity}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-emerald-400 font-mono">₴{o.totalValueUah.toLocaleString()}</span>
                  <button onClick={() => accept(o.id)} disabled={!info.hasHub || accepting === o.id}
                    className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-[10px] rounded">
                    {accepting === o.id ? "..." : "Взяти"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {info.myOrders.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-400">Мої замовлення</p>
          {info.myOrders.map(o => (
            <div key={o.id} className="flex items-center justify-between text-xs text-gray-500">
              <span>{o.productSku} {o.fromCity} → {o.toCity}</span>
              <span className={o.status === "COMPLETED" ? "text-emerald-400" : "text-amber-400"}>
                {o.status === "COMPLETED" ? `✓ ₴${o.totalValueUah.toLocaleString()}` : "У процесі..."}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── B2bTab ───────────────────────────────────────────────────────────────────
function B2bTab({ enterpriseId }: { enterpriseId: string }) {
  const [agreements, setAgreements] = useState<{
    id: string; isActive: boolean; quantityPerTick: number;
    totalTransferred: number; product: { sku: string; nameUa: string };
    sourceEnterprise: { id: string; name: string }; targetEnterprise: { id: string; name: string };
  }[]>([]);
  const [allEnterprises, setAllEnterprises] = useState<{ id: string; name: string; type: string }[]>([]);
  const [invProducts, setInvProducts] = useState<{ sku: string; nameUa: string }[]>([]);
  const [form, setForm] = useState({ targetId: "", productSku: "", qty: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = () => {
    fetch("/api/b2b-transfer").then(r => r.ok ? r.json() : null).then(d => setAgreements(d?.agreements ?? [])).catch(() => {});
  };
  useEffect(() => {
    reload();
    fetch("/api/enterprises").then(r => r.ok ? r.json() : null).then(d => setAllEnterprises(d?.enterprises ?? [])).catch(() => {});
    fetch("/api/products?take=100").then(r => r.ok ? r.json() : null).then(d => setInvProducts(d?.products ?? [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!form.targetId || !form.productSku || !form.qty) return;
    setLoading(true); setMsg(null);
    const r = await fetch("/api/b2b-transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceEnterpriseId: enterpriseId, targetEnterpriseId: form.targetId, productSku: form.productSku, quantityPerTick: parseFloat(form.qty), pricePerUnit: 0 }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (r.ok) { reload(); setForm({ targetId: "", productSku: "", qty: "" }); }
    setLoading(false);
  };
  const deactivate = async (id: string) => {
    const r = await fetch(`/api/b2b-transfer?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    setMsg(r.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (r.ok) reload();
  };

  const myAgreements = agreements.filter(a => a.sourceEnterprise.id === enterpriseId || a.targetEnterprise.id === enterpriseId);
  const others = allEnterprises.filter(e => e.id !== enterpriseId);

  return (
    <div className="space-y-4 p-1">
      <div className="rounded-lg border border-purple-900/40 bg-purple-950/10 p-3 space-y-2">
        <p className="text-xs font-semibold text-purple-400">Новий автотрансфер B2B</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.targetId} onChange={e => setForm(p => ({ ...p, targetId: e.target.value }))}
            className="col-span-2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500">
            <option value="">Ціль (підприємство)</option>
            {others.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={form.productSku} onChange={e => setForm(p => ({ ...p, productSku: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500">
            <option value="">Товар</option>
            {invProducts.map(p => <option key={p.sku} value={p.sku}>{p.nameUa}</option>)}
          </select>
          <input type="number" placeholder="Кількість/день" value={form.qty} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
        </div>
        <button onClick={create} disabled={loading || !form.targetId || !form.productSku || !form.qty}
          className="w-full py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded">
          {loading ? "..." : "Створити автотрансфер"}
        </button>
        {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
      </div>
      {myAgreements.length > 0 && (
        <div className="space-y-1.5">
          {myAgreements.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs border border-gray-800 rounded p-2">
              <div>
                <span className="font-mono text-purple-300">{a.product.sku}</span>
                <span className="text-gray-400 ml-2">x{a.quantityPerTick}/день</span>
                <span className="text-gray-600 ml-2">{a.sourceEnterprise.name} → {a.targetEnterprise.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-[10px]">{a.totalTransferred.toFixed(0)} перенесено</span>
                {a.isActive && a.sourceEnterprise.id === enterpriseId
                  ? <button onClick={() => deactivate(a.id)} className="text-red-500 hover:text-red-400 text-[10px]">Зупинити</button>
                  : <span className="text-gray-600 text-[10px]">{a.isActive ? "активна" : "зупинена"}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
