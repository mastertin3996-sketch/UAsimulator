"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Loader2, AlertCircle, Star, ChevronRight, Building2, Users } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

const LEVEL_NAMES = ["—", "Молодший", "Середній", "Старший", "Експерт", "Майстер"];
const LEVEL_COLORS = [
  "text-gray-500",
  "text-blue-400",
  "text-emerald-400",
  "text-amber-400",
  "text-purple-400",
  "text-red-400",
];
const PROFESSION_UA: Record<string, string> = {
  ACCOUNTANT: "Бухгалтер", MANAGER: "Менеджер", OPERATOR: "Оператор",
  ENGINEER: "Інженер", AGRONOMIST: "Агроном", LOADER: "Вантажник",
  DRIVER: "Водій", SECURITY_GUARD: "Охоронець", SECURITY_OFFICER: "Нач. охорони",
  CLEANER: "Прибиральник", SALES_REP: "Торг. представник", IT_SPECIALIST: "IT-спеціаліст",
  LAWYER: "Юрист", HR_SPECIALIST: "HR-спеціаліст", TECHNICIAN: "Технік",
  QUALITY_CONTROLLER: "Контролер якості",
};

interface Employee {
  id: string; name: string; profession: string; enterpriseName: string;
  qualificationLevel: number; baseEfficiency: number; efficiency: number;
  salaryUah: number; mood: number;
  activeTraining: { id: string; targetLevel: number; ticksRemaining: number; ticksRequired: number } | null;
}
interface TrainingConfig { costUah: number; ticks: number; efficiencyBonus: number }

export default function QualificationClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [config, setConfig]       = useState<Record<number, TrainingConfig>>({});
  const [cashBalance, setCash]    = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [starting, setStarting]   = useState<string | null>(null);
  const [filter, setFilter]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/qualification");
      const d = await r.json();
      setEmployees(d.employees ?? []);
      setConfig(d.config ?? {});
      setCash(d.cashBalance ?? 0);
    } catch { setError("Помилка завантаження"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function startTraining(emp: Employee) {
    if (emp.qualificationLevel >= 5) return;
    setStarting(emp.id);
    const r = await fetch("/api/qualification", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ employeeId: emp.id }),
    });
    setStarting(null);
    if (r.ok) { load(); } else { const d = await r.json(); alert(d.error); }
  }

  const filtered = employees.filter((e) =>
    !filter || e.name.toLowerCase().includes(filter.toLowerCase()) ||
    e.enterpriseName.toLowerCase().includes(filter.toLowerCase()) ||
    (PROFESSION_UA[e.profession] ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const totalTraining = employees.filter((e) => e.activeTraining).length;
  const avgLevel = employees.length
    ? (employees.reduce((s, e) => s + e.qualificationLevel, 0) / employees.length).toFixed(1)
    : "—";

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-gray-500" size={32} />
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-2 text-red-400">
      <AlertCircle size={20} /> {error}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-950 flex items-center justify-center">
            <GraduationCap size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Кваліфікація</h1>
            <p className="text-xs text-gray-500">Навчання та підвищення ефективності працівників</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Баланс</p>
          <p className="text-lg font-bold text-white">₴{formatNumber(Math.round(cashBalance))}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Всього працівників", value: employees.length, icon: Users },
          { label: "На навчанні", value: totalTraining, icon: GraduationCap },
          { label: "Середній рівень", value: avgLevel, icon: Star },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-3">
            <Icon size={18} className="text-purple-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Вартість навчання</p>
        <div className="grid grid-cols-5 gap-2">
          {[1,2,3,4,5].map((lvl) => {
            const cfg = config[lvl];
            return (
              <div key={lvl} className="rounded-lg bg-gray-800 p-3 text-center">
                <p className={cn("text-sm font-bold", LEVEL_COLORS[lvl])}>{LEVEL_NAMES[lvl]}</p>
                <p className="text-xs text-white mt-1">₴{cfg ? formatNumber(cfg.costUah) : "—"}</p>
                <p className="text-[10px] text-gray-500">{cfg ? `${cfg.ticks} тіків` : ""}</p>
                <p className="text-[10px] text-emerald-400">{cfg ? `+${(cfg.efficiencyBonus * 100).toFixed(0)}% ефект.` : ""}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
          <p className="text-sm font-semibold text-white flex-1">Працівники ({filtered.length})</p>
          <input
            type="text" placeholder="Пошук..." value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">Немає працівників</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {filtered.map((emp) => {
              const nextLvl  = emp.qualificationLevel + 1;
              const cfg      = config[nextLvl];
              const canTrain = !emp.activeTraining && emp.qualificationLevel < 5 && cashBalance >= (cfg?.costUah ?? Infinity);
              const isMax    = emp.qualificationLevel >= 5;

              return (
                <div key={emp.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{emp.name}</p>
                      <span className="text-[10px] text-gray-600">{PROFESSION_UA[emp.profession] ?? emp.profession}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Building2 size={10} className="text-gray-600" />
                      <p className="text-[11px] text-gray-500 truncate">{emp.enterpriseName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} size={10}
                        className={s <= emp.qualificationLevel ? LEVEL_COLORS[emp.qualificationLevel] : "text-gray-700"}
                        fill={s <= emp.qualificationLevel ? "currentColor" : "none"}
                      />
                    ))}
                    <span className={cn("text-xs ml-1", LEVEL_COLORS[emp.qualificationLevel])}>
                      {LEVEL_NAMES[emp.qualificationLevel] || "Без рівня"}
                    </span>
                  </div>

                  <div className="text-right shrink-0 w-20">
                    <p className="text-xs text-gray-500">Ефективність</p>
                    <p className="text-sm font-bold text-white">{(emp.efficiency * 100).toFixed(0)}%</p>
                  </div>

                  <div className="shrink-0 w-40">
                    {emp.activeTraining ? (
                      <div className="text-right">
                        <p className="text-[10px] text-amber-400">→ {LEVEL_NAMES[emp.activeTraining.targetLevel]}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${((emp.activeTraining.ticksRequired - emp.activeTraining.ticksRemaining) / emp.activeTraining.ticksRequired) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{emp.activeTraining.ticksRemaining} тіків</p>
                      </div>
                    ) : isMax ? (
                      <p className="text-[11px] text-purple-400 text-right font-medium">Майстер ✓</p>
                    ) : (
                      <button
                        onClick={() => startTraining(emp)}
                        disabled={!canTrain || starting === emp.id}
                        className={cn(
                          "w-full flex items-center justify-end gap-1 text-xs transition-colors",
                          canTrain ? "text-purple-400 hover:text-purple-300" : "text-gray-600 cursor-not-allowed",
                        )}
                      >
                        {starting === emp.id && <Loader2 size={12} className="animate-spin" />}
                        {cfg ? `₴${formatNumber(cfg.costUah)}` : ""}
                        <ChevronRight size={12} />
                        {LEVEL_NAMES[nextLvl]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
