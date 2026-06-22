import { useState } from 'react';
import {
  Users, TrendingUp, AlertTriangle, Smile, Meh, Frown,
  ChevronDown, ChevronRight, CircleDollarSign,
} from 'lucide-react';
import type { Employee, Profession, CityHub } from '../types';
import { fmt } from '../types';

const PROFESSION_UA: Record<Profession, string> = {
  ACCOUNTANT:          'Бухгалтер',
  MANAGER:             'Менеджер',
  OPERATOR:            'Оператор',
  ENGINEER:            'Інженер',
  AGRONOMIST:          'Агроном',
  LOADER:              'Вантажник',
  DRIVER:              'Водій',
  SECURITY_GUARD:      'Охоронець',
  CLEANER:             'Прибиральник',
  SALES_REP:           'Торговий представник',
  IT_SPECIALIST:       'IT-фахівець',
  LAWYER:              'Юрист',
  HR_SPECIALIST:       'HR-фахівець',
  TECHNICIAN:          'Технік',
  QUALITY_CONTROLLER:  'Контролер якості',
};

function MoodIcon({ mood }: { mood: number }) {
  if (mood >= 0.65) return <Smile  size={13} className="text-emerald-400" />;
  if (mood >= 0.40) return <Meh    size={13} className="text-amber-400"  />;
  return                    <Frown  size={13} className="text-red-400"    />;
}

function MoodBar({ mood }: { mood: number }) {
  const pct   = mood * 100;
  const color =
    mood >= 0.65 ? 'bg-emerald-500' :
    mood >= 0.40 ? 'bg-amber-500'   : 'bg-red-500';
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EmployeeRow({ emp, wageBaseline }: { emp: Employee; wageBaseline: number }) {
  const belowBaseline = emp.salaryUah < wageBaseline;
  const moodClass =
    emp.isOnStrike    ? 'text-red-400 font-semibold' :
    emp.mood >= 0.65  ? 'text-emerald-400'            :
    emp.mood >= 0.40  ? 'text-amber-400'               : 'text-red-400';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg
      ${emp.isOnStrike ? 'bg-red-950/30 border border-red-800/40' : 'bg-slate-800/20 border border-slate-700/20'}
    `}>
      {/* Name & profession */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-200 truncate">
            {emp.firstName} {emp.lastName}
          </span>
          {emp.isOnStrike && (
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs bg-red-900/70 text-red-300 font-medium animate-pulse">
              ✊ СТРАЙК
            </span>
          )}
          {belowBaseline && !emp.isOnStrike && (
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs bg-amber-900/60 text-amber-300">
              ↓ ЗП
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">{PROFESSION_UA[emp.profession]}</p>
      </div>

      {/* Salary */}
      <div className="hidden sm:block text-right w-24 flex-shrink-0">
        <p className={`text-xs tabular-nums font-medium
          ${belowBaseline ? 'text-amber-400' : 'text-slate-300'}
        `}>{fmt.uah(emp.salaryUah)}</p>
        <p className="text-xs text-slate-500">/міс</p>
      </div>

      {/* Mood */}
      <div className="w-28 flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <MoodIcon mood={emp.mood} />
          <span className={`text-xs tabular-nums ${moodClass}`}>
            {fmt.pct(emp.mood)}
          </span>
          <span className="text-xs text-slate-500 ml-auto">
            ×{emp.efficiency.toFixed(2)}
          </span>
        </div>
        <MoodBar mood={emp.mood} />
      </div>
    </div>
  );
}

interface EnterpriseGroup {
  entId:         string;
  entName:       string;
  entType:       string;
  cityName:      string;
  wageBaseline:  number;
  employees:     Employee[];
}

interface Props {
  hubs:          CityHub[];
  onRaiseSalary: (entId: string) => void;
}

export function HRPanel({ hubs, onRaiseSalary }: Props) {
  const [expandedEnts, setExpandedEnts] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpandedEnts(prev => ({ ...prev, [id]: !prev[id] }));

  const groups: EnterpriseGroup[] = hubs.flatMap(hub =>
    hub.enterprises
      .filter(e => e.employees.length > 0)
      .map(e => ({
        entId:        e.id,
        entName:      e.name,
        entType:      e.type,
        cityName:     hub.city.nameUa,
        wageBaseline: hub.city.wageBaselineUah,
        employees:    e.employees,
      })),
  );

  const totalStrikers = groups.flatMap(g => g.employees).filter(e => e.isOnStrike).length;
  const totalBelow    = groups.flatMap(g =>
    g.employees.filter(e => e.salaryUah < g.wageBaseline),
  ).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <Users size={14} className="text-indigo-400" />
          HR та персонал
        </h2>
        <div className="flex items-center gap-2">
          {totalStrikers > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/60 text-red-300 border border-red-700/50 animate-pulse">
              ✊ {totalStrikers} на страйку
            </span>
          )}
          {totalBelow > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700/40">
              <AlertTriangle size={10} />
              {totalBelow} нижче мінімуму
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {groups.map(group => {
          const isExpanded    = expandedEnts[group.entId] !== false;  // default open
          const groupStrikers = group.employees.filter(e => e.isOnStrike).length;
          const groupBelow    = group.employees.filter(e => e.salaryUah < group.wageBaseline).length;
          const avgMood       = group.employees.reduce((s, e) => s + e.mood, 0) / group.employees.length;
          const totalPayroll  = group.employees.reduce((s, e) => s + e.salaryUah, 0);

          return (
            <div
              key={group.entId}
              className="rounded-xl border border-slate-700/40 bg-slate-800/30 overflow-hidden"
            >
              {/* Group header */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/20 transition-colors text-left"
                onClick={() => toggle(group.entId)}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-white truncate">{group.entName}</h4>
                  <p className="text-xs text-slate-500">{group.cityName} · {group.employees.length} прац.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {groupStrikers > 0 && (
                    <span className="text-xs text-red-400 animate-pulse">✊ {groupStrikers}</span>
                  )}
                  {groupBelow > 0 && (
                    <span className="text-xs text-amber-400">
                      <AlertTriangle size={11} className="inline" /> {groupBelow}
                    </span>
                  )}
                  <span className={`text-xs tabular-nums font-medium
                    ${avgMood >= 0.65 ? 'text-emerald-400' : avgMood >= 0.40 ? 'text-amber-400' : 'text-red-400'}
                  `}>
                    {fmt.pct(avgMood)} настрій
                  </span>
                  {isExpanded
                    ? <ChevronDown size={13} className="text-slate-500" />
                    : <ChevronRight size={13} className="text-slate-500" />
                  }
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 space-y-2">
                  {/* Column labels */}
                  <div className="flex items-center gap-2 px-3 text-xs text-slate-500 font-medium uppercase tracking-wider">
                    <span className="flex-1">Працівник</span>
                    <span className="hidden sm:block w-24 text-right">Зарплата</span>
                    <span className="w-28">Настрій / Ефект.</span>
                  </div>

                  {group.employees.map(emp => (
                    <EmployeeRow key={emp.id} emp={emp} wageBaseline={group.wageBaseline} />
                  ))}

                  {/* Footer actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/40">
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <CircleDollarSign size={12} />
                      <span>ФОП/міс: </span>
                      <span className="text-slate-200 font-medium tabular-nums ml-0.5">
                        {fmt.uah(Math.round(totalPayroll * 1.22))}
                      </span>
                      <span className="text-slate-600 ml-1">(брутто + ЄСВ 22%)</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onRaiseSalary(group.entId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-800/50 hover:bg-indigo-700/60 text-indigo-200 border border-indigo-700/50 transition-colors"
                      >
                        <TrendingUp size={12} />
                        Зарплата +10%
                      </button>
                    </div>
                  </div>

                  {/* Wage baseline warning */}
                  {groupBelow > 0 && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>
                        {groupBelow} прац. отримують менше мінімального рівня {group.cityName} (₴{group.wageBaseline.toLocaleString('uk-UA')}/міс).
                        Настрій падатиме ~0.05/тік → ризик страйку через ~{Math.floor(10)} тиків.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
