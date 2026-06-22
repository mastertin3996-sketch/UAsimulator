"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Zap, Users, Package, Factory,
  AlertCircle, AlertTriangle, Wrench, Hammer, CheckCircle2,
  TrendingUp, TrendingDown, Cpu, Leaf,
} from "lucide-react";
import { cn, formatUAH, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = "management" | "workshops" | "hr" | "warehouse" | "production" | "supply" | "showcase";

interface Props {
  enterpriseId: string;
  initialTab?: Tab;
  title?: string;
}

interface Employee {
  id: string; firstName: string; lastName: string; profession: string;
  salaryUah: number; mood: number; efficiency: number;
  isOnStrike: boolean; hiredAt: string; accruedSalaryUah: number;
}

interface Equipment {
  id: string; name: string; status: string; wearAndTear: number;
  energyConsumptionKw: number; marketValueUah: number; isBroken: boolean;
}

interface Workshop {
  id: string; name: string; footprintM2: number; maxCapacity: number;
  currentVolume: number; isActive: boolean;
  equipment: Equipment[];
  productionOrders: {
    id: string; targetQuantity: number; completedQuantity: number;
    outputQuality: number | null; ticksRemaining: number;
    recipe: { id: string; name: string } | null;
  }[];
}

interface InventoryItem {
  quantity: number; quality: number;
  product: { id: string; sku: string; nameUa: string; unit: string };
}

interface FinancialLog {
  id: string; category: string; amountUah: number;
  description: string; recordedAt: string; tickNumber: string;
}

interface EnterpriseData {
  id: string; name: string; type: string;
  footprintM2: number; totalFloorAreaM2: number;
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PROF_UA: Record<string, string> = {
  ACCOUNTANT: "Бухгалтер", MANAGER: "Менеджер", OPERATOR: "Оператор",
  ENGINEER: "Інженер", AGRONOMIST: "Агроном", LOADER: "Вантажник",
  DRIVER: "Водій", SECURITY_GUARD: "Охоронник", SECURITY_OFFICER: "Нач. охорони",
  CLEANER: "Прибиральник", SALES_REP: "Торговий представник",
  IT_SPECIALIST: "IT-спеціаліст", LAWYER: "Юрист", HR_SPECIALIST: "HR-спеціаліст",
  TECHNICIAN: "Технік", QUALITY_CONTROLLER: "Контролер якості",
  RESEARCHER: "Дослідник", DATA_SCIENTIST: "Data scientist",
};

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
        <div
          className={cn("h-full rounded-full transition-all", pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500")}
          style={{ width: `${pct}%` }}
        />
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
        <div
          className={cn("h-full rounded-full transition-all", pct < 30 ? "bg-emerald-500" : pct < 80 ? "bg-amber-500" : "bg-red-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

function ManagementTab({ enterprise, stats }: { enterprise: EnterpriseData; stats: { salaryPerTick: number; rentPerTick: number; avgEfficiency: number; avgMood: number } }) {
  const isActive = enterprise.isOperational && !enterprise.isSeized;
  return (
    <div className="space-y-6">
      {/* Status alerts */}
      {(enterprise.isSeized || enterprise.isFrozenByInspection || enterprise.isLegallyFrozen) && (
        <div className="space-y-2">
          {enterprise.isSeized && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              <AlertCircle size={15} /> Підприємство вилучено (банкрутство)
            </div>
          )}
          {enterprise.isFrozenByInspection && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm">
              <AlertTriangle size={15} /> Заморожено податковою інспекцією
            </div>
          )}
          {enterprise.isLegallyFrozen && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm">
              <AlertTriangle size={15} /> Судовий арешт {enterprise.legalFreezeReason ? `— ${enterprise.legalFreezeReason}` : ""}
            </div>
          )}
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Місто", value: enterprise.landPlot.city.nameUa },
          { label: "Регіон", value: enterprise.landPlot.city.region },
          { label: "Площа забудови", value: `${enterprise.footprintM2.toLocaleString("uk")} м²` },
          { label: "Площа будівлі", value: `${enterprise.totalFloorAreaM2.toLocaleString("uk")} м²` },
          { label: "Земельна ділянка", value: enterprise.landPlot.status === "OWNED" ? "Власна" : "Оренда" },
          { label: "Побудовано", value: enterprise.constructedAt ? new Date(enterprise.constructedAt).toLocaleDateString("uk") : "—" },
          { label: "Тариф ел/е", value: `${Number(enterprise.landPlot.energyTariffUah).toFixed(2)} ₴/кВт·год` },
          { label: "Оренда/місяць", value: formatUAH(enterprise.landPlot.monthlyLeaseCostUah) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-sm text-white font-medium">{value}</p>
          </div>
        ))}
      </div>

      {/* Costs per tick */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Витрати / тік</h3>
        <div className="space-y-2">
          {[
            { label: "ФОП (зарплата + ЄСВ 22%)", value: stats.salaryPerTick },
            { label: "Оренда землі", value: stats.rentPerTick },
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

      {/* Staff summary */}
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
          <p className="text-xs text-gray-500 mt-0.5">{enterprise.employees.filter((e) => e.isOnStrike).length} на страйку</p>
        </div>
      </div>

      {/* Energy */}
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
    </div>
  );
}

function WorkshopsTab({ workshops }: { workshops: Workshop[] }) {
  if (workshops.length === 0) {
    return (
      <div className="py-16 text-center">
        <Factory size={28} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Цехів немає</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {workshops.map((w) => {
        const allEquip = w.equipment;
        const brokenCount = allEquip.filter((e) => e.status === "BROKEN").length;
        const wornCount = allEquip.filter((e) => e.status === "WORN").length;
        const capacityPct = w.maxCapacity > 0 ? Math.round((w.currentVolume / w.maxCapacity) * 100) : 0;

        return (
          <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            {/* Workshop header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{w.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{w.footprintM2} м² · макс {w.maxCapacity} од/тік</p>
              </div>
              <div className="flex items-center gap-2">
                {brokenCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/15 rounded px-1.5 py-0.5">
                    <Hammer size={9} /> {brokenCount} зламано
                  </span>
                )}
                {wornCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/15 rounded px-1.5 py-0.5">
                    <Wrench size={9} /> {wornCount} зношено
                  </span>
                )}
                <span className={cn(
                  "text-[10px] font-medium rounded-full px-2 py-0.5",
                  w.isActive ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 bg-gray-800",
                )}>
                  {w.isActive ? "Активний" : "Зупинено"}
                </span>
              </div>
            </div>

            {/* Capacity bar */}
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Завантаженість</span>
                <span className="text-[10px] font-mono text-gray-400">{w.currentVolume} / {w.maxCapacity}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", capacityPct >= 80 ? "bg-emerald-500" : capacityPct >= 40 ? "bg-amber-500" : "bg-gray-600")}
                  style={{ width: `${capacityPct}%` }}
                />
              </div>
            </div>

            {/* Active orders */}
            {w.productionOrders.length > 0 && (
              <div className="px-4 pt-3 space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Активне виробництво</p>
                {w.productionOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                    <span className="text-gray-300">{o.recipe?.name ?? "—"}</span>
                    <div className="flex items-center gap-3 text-gray-500">
                      <span>{o.completedQuantity}/{o.targetQuantity} од</span>
                      {o.outputQuality !== null && <span>якість {o.outputQuality.toFixed(1)}</span>}
                      <span>{o.ticksRemaining} тіків</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Equipment list */}
            {allEquip.length > 0 && (
              <div className="px-4 pt-3 pb-4 space-y-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Обладнання</p>
                {allEquip.map((eq) => (
                  <div key={eq.id} className="flex items-center gap-3 text-xs border border-gray-800 rounded-lg px-3 py-2">
                    <Cpu size={12} className="text-gray-500 shrink-0" />
                    <span className="flex-1 text-gray-300">{eq.name}</span>
                    <span className={cn("font-medium", STATUS_COLOR[eq.status] ?? "text-gray-400")}>
                      {STATUS_UA[eq.status] ?? eq.status}
                    </span>
                    <div className="w-24">
                      <WearBar value={eq.wearAndTear} />
                    </div>
                    <span className="text-gray-600 w-16 text-right">{formatUAH(eq.marketValueUah)}</span>
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

function HRTab({ employees }: { employees: Employee[] }) {
  const onStrike = employees.filter((e) => e.isOnStrike);

  if (employees.length === 0) {
    return (
      <div className="py-16 text-center">
        <Users size={28} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Персоналу немає</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onStrike.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={14} /> {onStrike.length} співробітників на страйку
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_100px_100px_80px] px-4 py-2 border-b border-gray-800">
          {["Співробітник", "Посада", "Зарплата", "Настрій", "Ефект."].map((h) => (
            <span key={h} className="text-[10px] uppercase tracking-wider text-gray-500">{h}</span>
          ))}
        </div>
        {employees.map((emp) => (
          <div
            key={emp.id}
            className={cn(
              "grid grid-cols-[1fr_140px_100px_100px_80px] items-center px-4 py-3 border-b border-gray-800 last:border-0",
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
          </div>
        ))}
      </div>

      {/* Payroll summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Сумарний ФОП (брутто + ЄСВ 22%)</span>
          <span className="font-mono font-semibold text-orange-400">
            {formatUAH(employees.reduce((s, e) => s + e.salaryUah * 1.22, 0))} / місяць
          </span>
        </div>
      </div>
    </div>
  );
}

function WarehouseTab({ inventory }: { inventory: InventoryItem[] }) {
  if (inventory.length === 0) {
    return (
      <div className="py-16 text-center">
        <Package size={28} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Склад порожній</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_80px_80px] px-4 py-2 border-b border-gray-800">
        {["Товар", "SKU", "Кількість", "Якість"].map((h) => (
          <span key={h} className="text-[10px] uppercase tracking-wider text-gray-500">{h}</span>
        ))}
      </div>
      {inventory.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px_80px] items-center px-4 py-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
          <span className="text-sm text-white">{item.product.nameUa}</span>
          <span className="text-xs text-gray-500 font-mono">{item.product.sku}</span>
          <span className="text-sm font-mono text-gray-300">{formatNumber(item.quantity)} {item.product.unit}</span>
          <span className={cn("text-sm font-mono", item.quality >= 8 ? "text-emerald-400" : item.quality >= 5 ? "text-amber-400" : "text-red-400")}>
            {item.quality.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function LogsTab({ logs }: { logs: FinancialLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="py-16 text-center">
        <TrendingUp size={28} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Фінансових записів ще немає</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((l) => {
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

// ─── Main ──────────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: "management", label: "Загальне" },
  { key: "workshops",  label: "Цехи" },
  { key: "hr",         label: "Персонал" },
  { key: "warehouse",  label: "Склад" },
  { key: "production", label: "Фінанси" },
  { key: "supply",     label: "Постачання" },
];

export default function EnterpriseDetailClient({ enterpriseId, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "management");
  const [data, setData] = useState<{
    enterprise: EnterpriseData;
    stats: { salaryPerTick: number; rentPerTick: number; avgEfficiency: number; avgMood: number };
    logs: FinancialLog[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/enterprises/${enterpriseId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enterpriseId]);

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
        <Link href="/enterprises" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors">
          Назад
        </Link>
      </div>
    );
  }

  const { enterprise, stats, logs } = data;
  const isActive = enterprise.isOperational && !enterprise.isSeized && !enterprise.isFrozenByInspection && !enterprise.isLegallyFrozen;

  return (
    <div className="space-y-5">
      {/* Header */}
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
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
                Неактивне
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{enterprise.landPlot.city.nameUa} · {enterprise.type}</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Цехів", value: enterprise.workshops.length.toString() },
          { label: "Персонал", value: enterprise.employees.length.toString() },
          { label: "Витрати/тік", value: formatUAH(stats.salaryPerTick + stats.rentPerTick), color: "text-orange-400" },
          { label: "Ефективність", value: `${Math.round(stats.avgEfficiency * 100)}%`, color: stats.avgEfficiency >= 0.7 ? "text-emerald-400" : "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={cn("text-lg font-bold font-mono", color ?? "text-white")}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key
                ? "text-emerald-400 border-emerald-400"
                : "text-gray-500 border-transparent hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "management" && <ManagementTab enterprise={enterprise} stats={stats} />}
      {tab === "workshops"  && <WorkshopsTab  workshops={enterprise.workshops} />}
      {tab === "hr"         && <HRTab          employees={enterprise.employees} />}
      {tab === "warehouse"  && <WarehouseTab   inventory={enterprise.inventory} />}
      {tab === "production" && <LogsTab         logs={logs} />}
      {tab === "supply" && (
        <div className="py-16 text-center">
          <p className="text-gray-500 text-sm">Маршрути постачання — розробляється</p>
        </div>
      )}
    </div>
  );
}
