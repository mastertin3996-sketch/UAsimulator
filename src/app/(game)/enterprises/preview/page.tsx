"use client";

import { useState } from "react";
import {
  Factory, Users, Zap, TrendingUp, TrendingDown, Package, AlertTriangle,
  CheckCircle2, ChevronRight, Wrench, Leaf, Settings, BarChart3,
  ArrowRight, Flame, Cog, DollarSign, Activity, Box,
  Home, Bell, Star, Clock, Layers,
} from "lucide-react";

// ─── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_WORKERS = [
  { name: "Іваненко О.", role: "Агроном",  salary: 22000, mood: 85, status: "ok"      as const },
  { name: "Ковальчук М.", role: "Оператор", salary: 18000, mood: 60, status: "warning" as const },
  { name: "Петренко В.", role: "Водій",    salary: 20000, mood: 90, status: "ok"      as const },
  { name: "Марченко Л.", role: "Технік",   salary: 22000, mood: 45, status: "danger"  as const },
  { name: "Бондар С.",   role: "Менеджер", salary: 35000, mood: 80, status: "ok"      as const },
];

const MOCK_WORKSHOPS = [
  { id: "1", name: "Пшеничне поле",     status: "active" as const, recipe: "RM-WHEAT", progress: 65, output: 1200, numWorkers: 2, efficiency: 92 },
  { id: "2", name: "Молочна ферма",     status: "active" as const, recipe: "SF-MILK",  progress: 40, output: 340,  numWorkers: 2, efficiency: 85 },
  { id: "3", name: "Соняшникове поле",  status: "idle"   as const, recipe: "—",         progress: 0,  output: 0,    numWorkers: 1, efficiency: 0  },
];

const MOCK_INVENTORY = [
  { sku: "RM-WHEAT", name: "Пшениця",   qty: 4800, unit: "кг", emoji: "🌾" },
  { sku: "SF-MILK",  name: "Молоко",    qty: 1250, unit: "л",  emoji: "🥛" },
  { sku: "RM-CORN",  name: "Кукурудза", qty: 320,  unit: "кг", emoji: "🌽" },
  { sku: "AG-FERT",  name: "Добрива",   qty: 80,   unit: "кг", emoji: "🧪" },
];

const MOCK_ALERTS = [
  { type: "warning" as const, msg: "Ковальчук М.: настрій < 65% — ризик страйку" },
  { type: "danger"  as const, msg: "Марченко Л.: настрій критичний (45%)" },
  { type: "info"    as const, msg: "Рекомендовано: RM-WHEAT (+15% в літній сезон)" },
];

const MOCK = {
  name: "Агроферма Солоненко",
  type: "AGRO_FARM",
  city: "Київ",
  efficiency: 87,
  mood: 72,
  costPerTick: 4616,
  revenue: 18400,
  profit: 13784,
  soilQuality: 6.9,
  season: "Літо",
  tick: 38,
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

type MoodStatus = "ok" | "warning" | "danger" | "idle";

function StatusDot({ status }: { status: MoodStatus }) {
  const c: Record<MoodStatus, string> = {
    ok:      "bg-emerald-400",
    warning: "bg-amber-400",
    danger:  "bg-red-400 animate-pulse",
    idle:    "bg-gray-600",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${c[status]}`} />;
}

function ProgressRing({ pct, size = 48, stroke = 4, color = "#10b981" }: {
  pct: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

function Bar({ pct, color = "bg-emerald-500" }: { pct: number; color?: string }) {
  return (
    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function moodColor(mood: number) {
  if (mood >= 70) return "text-emerald-400";
  if (mood >= 50) return "text-amber-400";
  return "text-red-400";
}
function moodBar(mood: number) {
  if (mood >= 70) return "bg-emerald-500";
  if (mood >= 50) return "bg-amber-500";
  return "bg-red-500";
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT A — «Командний центр»  (sidebar + content, Anno/Tropico style)
// ═══════════════════════════════════════════════════════════════════════════════

type SectionA = "overview" | "production" | "people" | "finance" | "inventory";

function VariantA() {
  const [section, setSection] = useState<SectionA>("overview");

  const nav: { key: SectionA; icon: React.FC<{ size?: number; className?: string }>; label: string }[] = [
    { key: "overview",   icon: Home,      label: "Огляд" },
    { key: "production", icon: Factory,   label: "Виробництво" },
    { key: "people",     icon: Users,     label: "Команда" },
    { key: "finance",    icon: BarChart3, label: "Фінанси" },
    { key: "inventory",  icon: Package,   label: "Склад" },
  ];

  return (
    <div className="flex h-[720px] rounded-2xl border border-gray-800 overflow-hidden bg-gray-950 shadow-2xl">

      {/* ── Sidebar ── */}
      <div className="w-52 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900/60">
        {/* Enterprise identity */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-900/50 border border-emerald-700/40 flex items-center justify-center">
              <Leaf size={14} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Агроферма</p>
              <p className="text-[10px] text-gray-500">{MOCK.city}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg p-2">
            <div className="relative">
              <ProgressRing pct={MOCK.efficiency} size={40} stroke={3} color="#10b981" />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-emerald-400">{MOCK.efficiency}%</span>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Ефективність</p>
              <p className="text-[10px] text-emerald-400 font-medium">Відмінно</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setSection(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all text-sm ${
                section === key
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}>
              <Icon size={14} />
              <span>{label}</span>
              {key === "people" && (
                <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.5">!</span>
              )}
            </button>
          ))}
        </nav>

        {/* Alerts */}
        <div className="p-3 border-t border-gray-800 space-y-1.5">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Сповіщення</p>
          {MOCK_ALERTS.map((a, i) => (
            <div key={i} className={`text-[10px] rounded-lg p-2 ${
              a.type === "danger"  ? "bg-red-500/10 text-red-400 border border-red-500/20" :
              a.type === "warning" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
              "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            }`}>{a.msg}</div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/30">
          <div>
            <h1 className="text-base font-bold text-white">{MOCK.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 size={10} /> Активне</span>
              <span className="text-[11px] text-gray-500">Сезон: {MOCK.season} · Тік {MOCK.tick}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs border border-gray-700 transition-colors">
              <Settings size={12} className="inline mr-1" />Налаштування
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-400 text-xs border border-red-800/40 transition-colors">
              Призупинити
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {section === "overview" && (
            <div className="space-y-4">
              {/* KPI Row */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2"><TrendingUp size={13} className="text-emerald-400" /><span className="text-[10px] text-gray-500 uppercase tracking-wider">Дохід/тік</span></div>
                  <p className="text-xl font-bold font-mono text-white">₴{(MOCK.revenue / 1000).toFixed(1)}к</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">+12% vs минулий</p>
                </div>
                <div className="rounded-xl border border-orange-500/15 bg-orange-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2"><DollarSign size={13} className="text-orange-400" /><span className="text-[10px] text-gray-500 uppercase tracking-wider">Витрати/тік</span></div>
                  <p className="text-xl font-bold font-mono text-orange-400">₴{(MOCK.costPerTick / 1000).toFixed(1)}к</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">зарплата+оренда</p>
                </div>
                <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2"><Activity size={13} className="text-blue-400" /><span className="text-[10px] text-gray-500 uppercase tracking-wider">Прибуток</span></div>
                  <p className="text-xl font-bold font-mono text-white">₴{(MOCK.profit / 1000).toFixed(1)}к</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">чистий</p>
                </div>
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2"><Leaf size={13} className="text-emerald-400" /><span className="text-[10px] text-gray-500 uppercase tracking-wider">Якість ґрунту</span></div>
                  <p className="text-xl font-bold font-mono text-white">{MOCK.soilQuality}/10</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">добре</p>
                </div>
              </div>

              {/* Workshop cards */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-300">Виробничі ділянки</p>
                  <button className="text-[11px] text-emerald-500 hover:text-emerald-400 flex items-center gap-1 transition-colors">Всі цехи <ChevronRight size={12} /></button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {MOCK_WORKSHOPS.map(w => (
                    <div key={w.id} className={`rounded-xl border p-3 ${w.status === "active" ? "border-gray-700 bg-gray-900" : "border-gray-800 bg-gray-900/40"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-white truncate">{w.name}</span>
                        <StatusDot status={w.status === "active" ? "ok" : "idle"} />
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-[11px] text-emerald-300 bg-emerald-900/30 rounded px-1.5 py-0.5">{w.recipe}</span>
                        <span className="text-[10px] text-gray-500">{w.efficiency}%</span>
                      </div>
                      {w.status === "active" ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <Bar pct={w.progress} />
                            <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{w.progress}%</span>
                          </div>
                          <p className="text-[10px] text-gray-500">{w.output} од./тік · {w.numWorkers} прац.</p>
                        </>
                      ) : (
                        <button className="w-full mt-1 py-1 text-[11px] border border-dashed border-gray-700 rounded text-gray-500 hover:text-emerald-400 hover:border-emerald-700 transition-colors">
                          + Запустити рецепт
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Team summary */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-300">Команда ({MOCK_WORKERS.length} прац.)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-amber-400">
                    <AlertTriangle size={10} />2 попередження
                  </div>
                </div>
                <div className="space-y-2">
                  {MOCK_WORKERS.map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <StatusDot status={w.status} />
                      <span className="text-xs text-white w-32 truncate">{w.name}</span>
                      <span className="text-[11px] text-gray-500 w-28">{w.role}</span>
                      <Bar pct={w.mood} color={moodBar(w.mood)} />
                      <span className={`text-[10px] font-mono w-8 text-right ${moodColor(w.mood)}`}>{w.mood}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === "production" && (
            <div className="space-y-4">
              {MOCK_WORKSHOPS.map(w => (
                <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{w.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusDot status={w.status === "active" ? "ok" : "idle"} />
                        <span className="text-xs text-gray-400">{w.status === "active" ? "Виробляє" : "Простоює"}</span>
                        <span className="font-mono text-xs text-emerald-300 bg-emerald-900/20 rounded px-1.5 py-0.5">{w.recipe}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Ефективність</p>
                      <p className="text-lg font-bold text-emerald-400">{w.efficiency}%</p>
                    </div>
                  </div>
                  {w.status === "active" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 w-20">Прогрес</span>
                        <Bar pct={w.progress} />
                        <span className="text-xs font-mono text-white w-8">{w.progress}%</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <div className="text-center p-2 bg-gray-800 rounded-lg">
                          <p className="text-[10px] text-gray-500">Вихід/тік</p>
                          <p className="text-sm font-bold text-white">{w.output}</p>
                        </div>
                        <div className="text-center p-2 bg-gray-800 rounded-lg">
                          <p className="text-[10px] text-gray-500">Працівники</p>
                          <p className="text-sm font-bold text-white">{w.numWorkers}</p>
                        </div>
                        <div className="text-center p-2 bg-gray-800 rounded-lg">
                          <p className="text-[10px] text-gray-500">Змін/добу</p>
                          <p className="text-sm font-bold text-white">2</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button className="w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm text-gray-500 hover:text-emerald-400 hover:border-emerald-700 transition-colors flex items-center justify-center gap-2">
                      <Cog size={14} /> Призначити рецепт виробництва
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {section === "people" && (
            <div className="space-y-3">
              {MOCK_WORKERS.map((w, i) => (
                <div key={i} className={`rounded-xl border p-4 ${
                  w.status === "danger"  ? "border-red-800/50 bg-red-950/10" :
                  w.status === "warning" ? "border-amber-800/30 bg-amber-950/5" : "border-gray-800 bg-gray-900"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        w.status === "danger"  ? "bg-red-900/50 text-red-300" :
                        w.status === "warning" ? "bg-amber-900/30 text-amber-300" : "bg-gray-800 text-gray-300"
                      }`}>{w.name[0]}</div>
                      <div>
                        <p className="text-sm font-medium text-white">{w.name}</p>
                        <p className="text-xs text-gray-500">{w.role} · ₴{w.salary.toLocaleString()}/міс</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-2">
                        <p className="text-[10px] text-gray-500">Настрій</p>
                        <p className={`text-sm font-bold ${moodColor(w.mood)}`}>{w.mood}%</p>
                      </div>
                      <div className="w-20"><Bar pct={w.mood} color={moodBar(w.mood)} /></div>
                    </div>
                  </div>
                  {w.status === "danger" && (
                    <div className="mt-3 flex items-center gap-2">
                      <AlertTriangle size={12} className="text-red-400" />
                      <p className="text-xs text-red-400">Критичний рівень настрою — ризик страйку.</p>
                      <button className="ml-auto text-xs px-3 py-1 bg-red-800/50 hover:bg-red-700/50 text-red-300 rounded-lg border border-red-700/30 transition-colors">Бонус</button>
                    </div>
                  )}
                </div>
              ))}
              <button className="w-full py-3 rounded-xl border border-dashed border-gray-700 text-sm text-gray-500 hover:text-emerald-400 hover:border-emerald-700 transition-colors flex items-center justify-center gap-2">
                <Users size={14} /> Найняти нового працівника
              </button>
            </div>
          )}

          {section === "inventory" && (
            <div className="space-y-3">
              {MOCK_INVENTORY.map((item, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <span className="text-2xl w-10 text-center">{item.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold font-mono text-white">{item.qty.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{item.unit}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="px-2.5 py-1.5 bg-blue-900/40 hover:bg-blue-800/40 text-blue-400 text-xs rounded-lg border border-blue-800/30 transition-colors">Продати</button>
                    <button className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg border border-gray-700 transition-colors">Перевести</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === "finance" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                  <p className="text-xs text-gray-500 mb-2">Дохід цього тіку</p>
                  <p className="text-2xl font-bold font-mono text-emerald-400">₴{MOCK.revenue.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-600 mt-1">роздріб + B2B</p>
                </div>
                <div className="rounded-xl border border-orange-500/15 bg-orange-500/5 p-4">
                  <p className="text-xs text-gray-500 mb-2">Витрати цього тіку</p>
                  <p className="text-2xl font-bold font-mono text-orange-400">₴{MOCK.costPerTick.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-600 mt-1">зарплата + оренда</p>
                </div>
                <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
                  <p className="text-xs text-gray-500 mb-2">Чистий прибуток</p>
                  <p className="text-2xl font-bold font-mono text-blue-400">₴{MOCK.profit.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-600 mt-1">за тік</p>
                </div>
                <div className="rounded-xl border border-purple-500/15 bg-purple-500/5 p-4">
                  <p className="text-xs text-gray-500 mb-2">Рентабельність</p>
                  <p className="text-2xl font-bold font-mono text-purple-400">74.9%</p>
                  <p className="text-[11px] text-gray-600 mt-1">прибуток / дохід</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT B — «Дашборд Тайкуна»  (top KPI bar + tabs + cards)
// ═══════════════════════════════════════════════════════════════════════════════

type SectionB = "overview" | "production" | "people" | "inventory";

function VariantB() {
  const [section, setSection] = useState<SectionB>("overview");

  return (
    <div className="rounded-2xl border border-gray-800 overflow-hidden bg-gray-950 shadow-2xl" style={{ minHeight: 720 }}>
      {/* Top status bar */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-emerald-950/40 border-b border-gray-800 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-900/60 border border-emerald-700/50 flex items-center justify-center">
              <Leaf size={18} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">{MOCK.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={9} /> Активне</span>
                <span className="text-[11px] text-gray-600">·</span>
                <span className="text-[11px] text-gray-400">{MOCK.city} · {MOCK.season}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {([
              { icon: TrendingUp, label: "Дохід",   value: `₴${(MOCK.revenue / 1000).toFixed(0)}к`, color: "text-emerald-400" },
              { icon: DollarSign, label: "Витрати", value: `₴${(MOCK.costPerTick / 1000).toFixed(1)}к`, color: "text-orange-400" },
              { icon: Activity,   label: "Ефект.",  value: `${MOCK.efficiency}%`, color: "text-blue-400" },
              { icon: Users,      label: "Прац.",   value: `${MOCK_WORKERS.length}`, color: "text-purple-400" },
            ] as const).map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="text-center">
                <div className="flex items-center gap-1 mb-0.5">
                  <Icon size={10} className={color} />
                  <span className="text-[10px] text-gray-500">{label}</span>
                </div>
                <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-lg bg-amber-900/30 border border-amber-800/40 text-amber-400 hover:bg-amber-800/30 transition-colors">
              <Bell size={14} />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center">2</span>
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800/30 text-red-400 text-xs hover:bg-red-800/30 transition-colors">Пауза</button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800 bg-gray-900/50 px-4">
        {([
          { key: "overview", icon: Home, label: "Огляд" },
          { key: "production", icon: Cog, label: "Виробництво" },
          { key: "people", icon: Users, label: "Команда" },
          { key: "inventory", icon: Box, label: "Склад" },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs border-b-2 transition-colors ${
              section === key
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-5 overflow-y-auto" style={{ height: "calc(720px - 141px)" }}>
        {section === "overview" && (
          <div className="space-y-5">
            {/* Big efficiency + stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-emerald-950/20 p-5 flex flex-col items-center justify-center gap-3">
                <div className="relative">
                  <ProgressRing pct={MOCK.efficiency} size={90} stroke={6} color="#10b981" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-emerald-400">{MOCK.efficiency}%</span>
                    <span className="text-[10px] text-gray-500">ефект.</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-medium">Підприємство</p>
                  <p className="text-[11px] text-emerald-400 mt-0.5">Висока продуктивність</p>
                </div>
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><Leaf size={12} className="text-emerald-400" /><span className="text-[10px] text-gray-500">Якість ґрунту</span></div>
                  <p className="text-lg font-bold text-emerald-300 font-mono">{MOCK.soilQuality}/10</p>
                  <div className="mt-2"><Bar pct={MOCK.soilQuality * 10} color="bg-emerald-500" /></div>
                </div>
                <div className="rounded-xl border border-purple-800/30 bg-purple-950/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><Star size={12} className="text-purple-400" /><span className="text-[10px] text-gray-500">Настрій команди</span></div>
                  <p className="text-lg font-bold text-purple-300 font-mono">{MOCK.mood}%</p>
                  <div className="mt-2"><Bar pct={MOCK.mood} color="bg-purple-500" /></div>
                </div>
                <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><Leaf size={12} className="text-amber-400" /><span className="text-[10px] text-gray-500">Сезон</span></div>
                  <p className="text-lg font-bold text-amber-300 font-mono">{MOCK.season}</p>
                </div>
                <div className="rounded-xl border border-blue-800/30 bg-blue-950/10 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><Clock size={12} className="text-blue-400" /><span className="text-[10px] text-gray-500">Тік</span></div>
                  <p className="text-lg font-bold text-blue-300 font-mono">#{MOCK.tick}</p>
                </div>
              </div>
            </div>

            {/* Workshop grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Factory size={14} className="text-gray-400" /> Виробничі цехи
                </p>
                <button className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">+ Новий цех</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {MOCK_WORKSHOPS.map(w => (
                  <button key={w.id} onClick={() => setSection("production")}
                    className={`rounded-xl border text-left p-3 transition-all hover:scale-[1.02] ${
                      w.status === "active"
                        ? "border-emerald-800/40 bg-emerald-950/20 hover:border-emerald-600/60"
                        : "border-gray-700 bg-gray-900/40 hover:border-gray-600"
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${w.status === "active" ? "bg-emerald-900/60" : "bg-gray-800"}`}>
                        {w.status === "active" ? <Flame size={14} className="text-emerald-400" /> : <Cog size={14} className="text-gray-600" />}
                      </div>
                      <StatusDot status={w.status === "active" ? "ok" : "idle"} />
                    </div>
                    <p className="text-xs font-semibold text-white mb-1 truncate">{w.name}</p>
                    <p className="font-mono text-[11px] text-emerald-300 mb-2">{w.recipe}</p>
                    {w.status === "active" ? (
                      <>
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1"><span>Прогрес</span><span>{w.progress}%</span></div>
                        <Bar pct={w.progress} />
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-600 mt-1">Немає завдання</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Alerts */}
            {MOCK_ALERTS.filter(a => a.type !== "info").length > 0 && (
              <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={13} className="text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400">Увага</span>
                </div>
                {MOCK_ALERTS.filter(a => a.type !== "info").map((a, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs ${a.type === "danger" ? "text-red-400" : "text-amber-400"}`}>
                    <span>·</span><span>{a.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === "production" && (
          <div className="space-y-4">
            {MOCK_WORKSHOPS.map(w => (
              <div key={w.id} className={`rounded-2xl border p-5 ${w.status === "active" ? "border-gray-700 bg-gray-900" : "border-gray-800 bg-gray-900/30"}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${w.status === "active" ? "bg-emerald-900/50 border border-emerald-700/40" : "bg-gray-800 border border-gray-700"}`}>
                    {w.status === "active" ? <Flame size={20} className="text-emerald-400" /> : <Cog size={20} className="text-gray-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-sm font-bold text-white">{w.name}</h3>
                      <StatusDot status={w.status === "active" ? "ok" : "idle"} />
                      {w.status === "active" && <span className="text-[11px] text-emerald-400">{w.efficiency}% ефект.</span>}
                    </div>
                    {w.status === "active" ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono bg-emerald-900/30 text-emerald-300 rounded px-2 py-0.5">{w.recipe}</span>
                          <ArrowRight size={12} className="text-gray-600" />
                          <span className="text-xs text-gray-400">{w.output} од./тік</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Bar pct={w.progress} />
                          <span className="text-xs font-mono text-white">{w.progress}%</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 mb-3">Цех простоює. Призначте рецепт виробництва.</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {w.status === "active"
                      ? <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg border border-gray-700 transition-colors">Змінити</button>
                      : <button className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg transition-colors">Запустити</button>
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === "people" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Всього</p>
                <p className="text-xl font-bold text-white">{MOCK_WORKERS.length}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Попередження</p>
                <p className="text-xl font-bold text-amber-400">1</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Критично</p>
                <p className="text-xl font-bold text-red-400">1</p>
              </div>
            </div>
            {MOCK_WORKERS.map((w, i) => (
              <div key={i} className={`rounded-xl border p-4 flex items-center gap-4 ${
                w.status === "danger"  ? "border-red-800/40 bg-red-950/10" :
                w.status === "warning" ? "border-amber-800/30 bg-amber-950/5" : "border-gray-800 bg-gray-900"
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  w.status === "danger"  ? "bg-red-900/50 text-red-200" :
                  w.status === "warning" ? "bg-amber-900/30 text-amber-200" : "bg-gray-800 text-gray-300"
                }`}>{w.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{w.name}</p>
                  <p className="text-xs text-gray-500">{w.role}</p>
                </div>
                <div className="flex items-center gap-2 w-32">
                  <Bar pct={w.mood} color={moodBar(w.mood)} />
                  <span className={`text-xs font-mono w-8 text-right ${moodColor(w.mood)}`}>{w.mood}%</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-mono text-gray-300">₴{w.salary.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-600">/місяць</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === "inventory" && (
          <div className="grid grid-cols-2 gap-3">
            {MOCK_INVENTORY.map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{item.sku}</p>
                    <p className="text-xl font-bold font-mono text-white mt-2">{item.qty.toLocaleString()} <span className="text-sm text-gray-500">{item.unit}</span></p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="flex-1 py-1.5 text-xs bg-blue-900/30 hover:bg-blue-800/30 text-blue-400 rounded-lg border border-blue-800/30 transition-colors">Продати</button>
                  <button className="flex-1 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors">Перевести</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT C — «Менеджер Заводу»  (3 columns, power-user dense layout)
// ═══════════════════════════════════════════════════════════════════════════════

function VariantC() {
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-gray-800 overflow-hidden bg-gray-950 shadow-2xl" style={{ minHeight: 720 }}>
      {/* Status bar */}
      <div className="flex items-center gap-0 border-b border-gray-800 bg-gray-900 text-xs">
        <div className="px-4 py-3 border-r border-gray-800 flex items-center gap-2">
          <Leaf size={13} className="text-emerald-500" />
          <span className="text-gray-200 font-medium">{MOCK.name}</span>
          <span className="text-gray-600">·</span>
          <span className="text-emerald-400">● Активне</span>
        </div>
        <div className="flex items-center gap-5 px-4 py-3 flex-1">
          {([
            { l: "Ефект.", v: `${MOCK.efficiency}%`, c: "text-emerald-400" },
            { l: "Прибуток", v: `₴${(MOCK.profit / 1000).toFixed(1)}к/тік`, c: "text-blue-400" },
            { l: "Ґрунт", v: `${MOCK.soilQuality}/10`, c: "text-amber-400" },
            { l: "Сезон", v: MOCK.season, c: "text-gray-300" },
            { l: "Тік", v: `#${MOCK.tick}`, c: "text-gray-400" },
          ] as const).map(({ l, v, c }) => (
            <span key={l} className="text-gray-600">{l}: <span className={`font-mono ${c}`}>{v}</span></span>
          ))}
        </div>
        <div className="flex items-center gap-1 px-3 border-l border-gray-800">
          <button className="px-2.5 py-1.5 text-amber-400 bg-amber-900/30 border border-amber-800/30 rounded hover:bg-amber-800/30 transition-colors flex items-center gap-1">
            <Bell size={11} /><span>2</span>
          </button>
          <button className="px-2.5 py-1.5 text-red-400 bg-red-900/20 border border-red-900/30 rounded hover:bg-red-800/20 transition-colors text-[11px]">Пауза</button>
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-12 gap-0" style={{ height: "calc(720px - 40px)" }}>

        {/* Col 1 — Workshops (6 cols) */}
        <div className="col-span-6 border-r border-gray-800 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Factory size={12} /> Виробничі цехи
            </span>
            <button className="text-[11px] text-emerald-500 hover:text-emerald-400">+ Новий</button>
          </div>

          {MOCK_WORKSHOPS.map(w => (
            <div key={w.id}>
              <button onClick={() => setFocus(w.id === focus ? null : w.id)}
                className={`w-full text-left border-b border-gray-800/60 px-4 py-3 hover:bg-gray-800/30 transition-colors ${focus === w.id ? "bg-emerald-950/10 border-l-2 border-l-emerald-500" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${w.status === "active" ? "bg-emerald-900/50" : "bg-gray-800"}`}>
                    {w.status === "active" ? <Flame size={12} className="text-emerald-400" /> : <Cog size={12} className="text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">{w.name}</span>
                      <StatusDot status={w.status === "active" ? "ok" : "idle"} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-emerald-300">{w.recipe}</span>
                      <span className="text-[10px] text-gray-600">·</span>
                      <span className="text-[10px] text-gray-500">{w.numWorkers} прац.</span>
                      {w.status === "active" && <>
                        <span className="text-[10px] text-gray-600">·</span>
                        <span className="text-[10px] text-gray-500">{w.efficiency}%</span>
                      </>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 w-20">
                    {w.status === "active" ? (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[9px] text-gray-600"><span>прогрес</span><span>{w.progress}%</span></div>
                        <Bar pct={w.progress} />
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-600 italic">Простоює</span>
                    )}
                  </div>
                  <ChevronRight size={12} className={`text-gray-700 flex-shrink-0 transition-transform ${focus === w.id ? "rotate-90" : ""}`} />
                </div>
              </button>

              {focus === w.id && (
                <div className="px-4 pb-3 pt-2 border-b border-gray-800 bg-emerald-950/5 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-gray-800/60 rounded">
                      <p className="text-[9px] text-gray-500">Вихід</p>
                      <p className="text-xs font-mono text-white">{w.output}</p>
                    </div>
                    <div className="text-center p-2 bg-gray-800/60 rounded">
                      <p className="text-[9px] text-gray-500">Ефект.</p>
                      <p className="text-xs font-mono text-emerald-400">{w.efficiency}%</p>
                    </div>
                    <div className="text-center p-2 bg-gray-800/60 rounded">
                      <p className="text-[9px] text-gray-500">Прац.</p>
                      <p className="text-xs font-mono text-white">{w.numWorkers}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="flex-1 py-1.5 text-[11px] bg-emerald-800/40 hover:bg-emerald-700/40 text-emerald-300 rounded border border-emerald-700/30 transition-colors">Змінити рецепт</button>
                    <button className="flex-1 py-1.5 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors">Обладнання</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button className="w-full px-4 py-3 flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 hover:bg-gray-800/30 transition-colors">
            <span className="text-lg font-light">+</span> Розширити підприємство
          </button>
        </div>

        {/* Col 2 — Team (3 cols) */}
        <div className="col-span-3 border-r border-gray-800 overflow-y-auto">
          <div className="px-3 py-2.5 border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={12} /> Команда
            </span>
          </div>
          {MOCK_WORKERS.map((w, i) => (
            <div key={i} className={`px-3 py-2.5 border-b border-gray-800/60 ${w.status === "danger" ? "bg-red-950/10" : w.status === "warning" ? "bg-amber-950/5" : ""}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <StatusDot status={w.status} />
                <span className="text-xs font-medium text-white truncate flex-1">{w.name}</span>
                <span className="text-[10px] text-gray-500 font-mono shrink-0">₴{(w.salary / 1000).toFixed(0)}к</span>
              </div>
              <p className="text-[10px] text-gray-600 mb-1.5 ml-4">{w.role}</p>
              <div className="flex items-center gap-1.5 ml-4">
                <Bar pct={w.mood} color={moodBar(w.mood)} />
                <span className={`text-[10px] font-mono w-7 text-right shrink-0 ${moodColor(w.mood)}`}>{w.mood}%</span>
              </div>
              {w.status === "danger" && (
                <button className="mt-1.5 ml-4 text-[10px] text-red-400 hover:text-red-300 border border-red-800/40 rounded px-2 py-0.5 hover:bg-red-900/20 transition-colors">
                  + Бонус
                </button>
              )}
            </div>
          ))}
          <button className="w-full px-3 py-2.5 flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400 hover:bg-gray-800/20 transition-colors">
            <span>+</span> Найняти
          </button>
        </div>

        {/* Col 3 — Inventory + finance (3 cols) */}
        <div className="col-span-3 overflow-y-auto">
          <div className="px-3 py-2.5 border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Box size={12} /> Склад
            </span>
          </div>
          {MOCK_INVENTORY.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
              <span className="text-base w-6 text-center shrink-0">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white truncate">{item.name}</p>
                <p className="text-[10px] text-gray-600 font-mono">{item.sku}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono text-white">{item.qty >= 1000 ? `${(item.qty / 1000).toFixed(1)}к` : item.qty}</p>
                <p className="text-[9px] text-gray-600">{item.unit}</p>
              </div>
            </div>
          ))}

          {/* Finance */}
          <div className="mt-2 px-3 py-2.5 border-t border-gray-800">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Фінанси / тік</p>
            {[
              { l: "Дохід",   v: `+₴${MOCK.revenue.toLocaleString()}`,     c: "text-emerald-400" },
              { l: "Витрати", v: `-₴${MOCK.costPerTick.toLocaleString()}`,  c: "text-red-400" },
              { l: "Прибуток",v: `₴${MOCK.profit.toLocaleString()}`,        c: "text-blue-400" },
            ].map(({ l, v, c }) => (
              <div key={l} className="flex justify-between items-center py-1 border-b border-gray-800/50 last:border-0">
                <span className="text-[11px] text-gray-500">{l}</span>
                <span className={`text-[11px] font-mono font-medium ${c}`}>{v}</span>
              </div>
            ))}
          </div>

          {/* Agro */}
          <div className="mx-3 my-2 rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-3">
            <p className="text-[10px] text-emerald-500 font-semibold mb-2 uppercase tracking-wider">Агро</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]"><span className="text-gray-500">Ґрунт</span><span className="text-amber-400 font-mono">{MOCK.soilQuality}/10</span></div>
              <Bar pct={MOCK.soilQuality * 10} color="bg-amber-500" />
              <div className="flex justify-between text-[11px] mt-1"><span className="text-gray-500">Рекомендація</span><span className="text-emerald-400 font-mono text-[10px]">RM-WHEAT</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-gray-500">Сезон</span><span className="text-yellow-400">{MOCK.season}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Preview page
// ═══════════════════════════════════════════════════════════════════════════════

const VARIANTS = [
  {
    key: "A" as const,
    name: "Командний центр",
    desc: "Sidebar-навігація + розділи. Anno / Tropico style.",
    component: VariantA,
    best: "Великий екран, багато секцій",
  },
  {
    key: "B" as const,
    name: "Дашборд Тайкуна",
    desc: "Верхній KPI-рядок + картки. Transport Fever style.",
    component: VariantB,
    best: "Баланс між оглядом і деталями",
  },
  {
    key: "C" as const,
    name: "Менеджер Заводу",
    desc: "3 колонки: цехи | команда | склад. Щільний power-user UI.",
    component: VariantC,
    best: "Максимум інфо без кліків",
  },
];

export default function EnterprisePreviewPage() {
  const [active, setActive] = useState<"A" | "B" | "C">("A");
  const ActiveVariant = VARIANTS.find(v => v.key === active)!.component;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Варіанти UI підприємства</h1>
          <p className="text-sm text-gray-400 mt-1">Оберіть концепцію — або скажіть що взяти з кожної. Mock-дані, без API.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {VARIANTS.map(v => (
            <button key={v.key} onClick={() => setActive(v.key)}
              className={`rounded-xl border p-4 text-left transition-all ${
                active === v.key
                  ? "border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-900/20"
                  : "border-gray-700 bg-gray-900 hover:border-gray-600"
              }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${active === v.key ? "bg-emerald-500 text-black" : "bg-gray-700 text-gray-300"}`}>
                  {v.key}
                </div>
                <span className={`text-sm font-semibold ${active === v.key ? "text-emerald-400" : "text-white"}`}>{v.name}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">{v.desc}</p>
              <p className="text-[11px] text-gray-600">Краще для: {v.best}</p>
            </button>
          ))}
        </div>

        <ActiveVariant />

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
          <p className="text-white font-medium mb-1">Що далі?</p>
          <p>Скажіть який варіант подобається (A, B або C) — або що взяти з кожного. Після вибору зроблю рефакторинг <code className="text-emerald-400 text-xs">EnterpriseDetailClient.tsx</code> під обраний стиль.</p>
        </div>
      </div>
    </div>
  );
}
