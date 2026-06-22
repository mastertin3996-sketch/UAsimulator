import { useState } from 'react';
import {
  Factory, AlertTriangle, XCircle,
  Gauge, Zap, TrendingUp, ChevronDown, ChevronRight, Hammer,
} from 'lucide-react';
import type { Enterprise, Workshop, Equipment, EquipmentStatus } from '../types';
import { fmt } from '../types';

// ── Wear & Tear gauge ─────────────────────────────────────────────────────────

function WearBar({ wear, status }: { wear: number; status: EquipmentStatus }) {
  const pct = Math.min(100, wear * 100);
  const color =
    status === 'BROKEN'     ? 'bg-red-600'    :
    status === 'WORN'       ? 'bg-amber-500'  :
    wear > 0.30             ? 'bg-yellow-500' : 'bg-emerald-500';
  const bg =
    status === 'BROKEN'     ? 'bg-red-950/60' :
    status === 'WORN'       ? 'bg-amber-950/40' : 'bg-slate-700';

  return (
    <div className={`h-1.5 w-full rounded-full ${bg} overflow-hidden`}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Equipment row ─────────────────────────────────────────────────────────────

function EquipmentRow({
  eq,
  onRepair,
}: {
  eq: Equipment;
  onRepair: (id: string) => void;
}) {
  const labelColor =
    eq.status === 'BROKEN'     ? 'text-red-400'    :
    eq.status === 'WORN'       ? 'text-amber-400'  :
    eq.status === 'NEW'        ? 'text-cyan-400'   : 'text-emerald-400';

  const dotColor =
    eq.status === 'BROKEN'     ? 'bg-red-500 animate-pulse' :
    eq.status === 'WORN'       ? 'bg-amber-500'  :
    eq.status === 'NEW'        ? 'bg-cyan-400'   : 'bg-emerald-500';

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border
      ${eq.status === 'BROKEN' ? 'border-red-800/50 bg-red-950/20' :
        eq.status === 'WORN'   ? 'border-amber-800/40 bg-amber-950/10' :
                                  'border-slate-700/30 bg-slate-800/30'}
    `}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-sm text-slate-300 truncate">{eq.name}</span>
      </div>

      {/* Wear bar */}
      <div className="w-24 flex-shrink-0">
        <WearBar wear={eq.wearAndTear} status={eq.status} />
        <div className="flex justify-between mt-0.5">
          <span className={`text-xs tabular-nums ${labelColor}`}>{fmt.pct(eq.wearAndTear)}</span>
          <span className={`text-xs font-medium ${labelColor}`}>{eq.status}</span>
        </div>
      </div>

      {/* Energy */}
      <div className="hidden xl:flex items-center gap-1 w-20 flex-shrink-0 text-xs text-slate-400">
        <Zap size={10} className="text-cyan-500" />
        <span className="tabular-nums">{eq.energyConsumptionKw} кВт</span>
      </div>

      {/* Value */}
      <div className="hidden lg:block text-xs text-slate-400 tabular-nums w-24 flex-shrink-0 text-right">
        {fmt.uah(Math.round(eq.marketValueUah))}
      </div>

      {/* Repair button */}
      {(eq.status === 'BROKEN' || eq.status === 'WORN') && (
        <button
          onClick={() => onRepair(eq.id)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0
            ${eq.status === 'BROKEN'
              ? 'bg-red-800/60 hover:bg-red-700/70 text-red-200 border border-red-700/50'
              : 'bg-amber-900/50 hover:bg-amber-800/60 text-amber-200 border border-amber-700/40'}
          `}
        >
          <Hammer size={10} />
          {eq.status === 'BROKEN' ? 'Ремонт' : 'ТО'}
        </button>
      )}
    </div>
  );
}

// ── Workshop card ─────────────────────────────────────────────────────────────

function WorkshopCard({ ws, onRepair }: { ws: Workshop; onRepair: (id: string) => void }) {
  const utilisation = ws.maxCapacity > 0 ? ws.currentVolume / ws.maxCapacity : 0;
  const barColor    = utilisation >= 0.95 ? 'bg-amber-500' : utilisation >= 0.5 ? 'bg-indigo-500' : 'bg-slate-600';

  // Derive batch quality from equipment wear
  const avgWear     = ws.equipment.length
    ? ws.equipment.reduce((s, e) => s + e.wearAndTear, 0) / ws.equipment.length
    : 0;
  const equipFactor = Math.max(0, 1 - avgWear);
  const batchQuality = Math.min(10, Math.max(0, equipFactor * 10));
  const qColor =
    batchQuality >= 7.5 ? 'text-emerald-400' :
    batchQuality >= 5.0 ? 'text-amber-400'   : 'text-red-400';

  const brokenCount = ws.equipment.filter(e => e.status === 'BROKEN').length;

  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
            ${ws.isActive ? 'bg-emerald-400' : 'bg-slate-500'}
          `} />
          <h5 className="text-sm font-medium text-slate-200">{ws.name}</h5>
        </div>
        <div className="flex items-center gap-2">
          {brokenCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400 animate-pulse">
              <AlertTriangle size={11} />
              {brokenCount} зламано
            </span>
          )}
          <span className={`text-xs font-semibold tabular-nums ${qColor}`}>
            Якість {fmt.quality(batchQuality)}/10
          </span>
        </div>
      </div>

      {/* Capacity utilisation */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span className="flex items-center gap-1"><Gauge size={10} /> Завантаженість</span>
          <span className="tabular-nums">
            {fmt.fraction(Math.round(ws.currentVolume), ws.maxCapacity)} од/день
            <span className="ml-1 text-slate-500">({fmt.pct(utilisation)})</span>
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${utilisation * 100}%` }} />
        </div>
      </div>

      {/* Equipment list */}
      {ws.equipment.length > 0 && (
        <div className="space-y-1.5">
          {ws.equipment.map(eq => (
            <EquipmentRow key={eq.id} eq={eq} onRepair={onRepair} />
          ))}
        </div>
      )}
      {ws.equipment.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">Обладнання не встановлено</p>
      )}
    </div>
  );
}

// ── Enterprise card ───────────────────────────────────────────────────────────

const ENTERPRISE_LABELS: Record<string, string> = {
  FOOD_PROCESSING:  '🍞 Харчова переробка',
  TEXTILE_FACTORY:  '🧵 Текстиль',
  AGRO_FARM:        '🌾 Агропідприємство',
  OFFICE:           '🏢 Офіс',
  RETAIL_STORE:     '🛒 Роздріб',
  WAREHOUSE:        '📦 Склад',
  LOGISTICS_HUB:    '🚛 Логістика',
};

function EnterpriseCard({
  ent,
  cityName,
  onRepair,
  onRaiseSalary,
}: {
  ent: Enterprise;
  cityName: string;
  onRepair: (eqId: string) => void;
  onRaiseSalary: (entId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalCap  = ent.workshops.reduce((s, w) => s + w.maxCapacity, 0);
  const totalVol  = ent.workshops.reduce((s, w) => s + w.currentVolume, 0);
  const brokenEq  = ent.workshops.flatMap(w => w.equipment).filter(e => e.status === 'BROKEN').length;
  const wornEq    = ent.workshops.flatMap(w => w.equipment).filter(e => e.status === 'WORN').length;
  const strikers  = ent.employees.filter(e => e.isOnStrike).length;
  const avgMood   = ent.employees.length
    ? ent.employees.reduce((s, e) => s + e.mood, 0) / ent.employees.length
    : 0;

  const alertCount = brokenEq + strikers;

  return (
    <div className={`rounded-xl border bg-slate-800/30 overflow-hidden
      ${!ent.isOperational ? 'border-slate-600/40 opacity-60' :
        alertCount > 0      ? 'border-red-800/50'              : 'border-slate-700/50'}
    `}>
      {/* Card header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/20 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-white text-sm">{ent.name}</h4>
              {!ent.isOperational && (
                <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">
                  Будується
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">{ENTERPRISE_LABELS[ent.type] ?? ent.type}</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">{cityName}</span>
            </div>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {brokenEq > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/60 text-red-300 border border-red-800/50 animate-pulse">
              <XCircle size={10} />
              {brokenEq} зламано
            </span>
          )}
          {wornEq > 0 && !brokenEq && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-800/40">
              <AlertTriangle size={10} />
              {wornEq} WORN
            </span>
          )}
          {strikers > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/60 text-red-300 border border-red-800/50 animate-pulse">
              ✊ {strikers} страйк
            </span>
          )}
          {totalCap > 0 && (
            <span className="text-xs text-slate-400 tabular-nums hidden sm:block">
              {Math.round(totalVol)}/{totalCap} од/день
            </span>
          )}
          {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Floor area bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Площа будівлі</span>
              <span className="tabular-nums">
                {fmt.fraction(ent.usedFloorAreaM2, ent.totalFloorAreaM2)} м²
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-500"
                style={{ width: `${(ent.usedFloorAreaM2 / ent.totalFloorAreaM2) * 100}%` }}
              />
            </div>
          </div>

          {/* Workshops */}
          {ent.workshops.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium flex items-center gap-1">
                <Factory size={11} />
                Виробничі цехи
              </p>
              {ent.workshops.map(ws => (
                <WorkshopCard key={ws.id} ws={ws} onRepair={onRepair} />
              ))}
            </div>
          )}

          {/* Quick HR summary */}
          {ent.employees.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-700/40">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">
                  {ent.employees.length} прац.
                </span>
                <span className={`font-medium tabular-nums
                  ${avgMood >= 0.65 ? 'text-emerald-400' : avgMood >= 0.40 ? 'text-amber-400' : 'text-red-400'}
                `}>
                  Настрій {fmt.pct(avgMood)}
                </span>
                {strikers > 0 && (
                  <span className="text-red-400 font-medium animate-pulse">
                    ✊ {strikers} на страйку
                  </span>
                )}
              </div>
              <button
                onClick={() => onRaiseSalary(ent.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-800/50 hover:bg-indigo-700/60 text-indigo-200 border border-indigo-700/50 transition-colors"
              >
                <TrendingUp size={11} />
                ЗП +10%
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface Props {
  hubs:          import('../types').CityHub[];
  onRepair:      (eqId: string) => void;
  onRaiseSalary: (entId: string) => void;
}

export function EnterpriseManager({ hubs, onRepair, onRaiseSalary }: Props) {
  const allEnterprises = hubs.flatMap(hub =>
    hub.enterprises.map(e => ({ ent: e, cityName: hub.city.nameUa })),
  );

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Factory size={14} className="text-indigo-400" />
        Підприємства та виробництво
        <span className="ml-auto text-slate-500 text-xs normal-case font-normal">
          {allEnterprises.length} об'єктів
        </span>
      </h2>
      <div className="space-y-3">
        {allEnterprises.map(({ ent, cityName }) => (
          <EnterpriseCard
            key={ent.id}
            ent={ent}
            cityName={cityName}
            onRepair={onRepair}
            onRaiseSalary={onRaiseSalary}
          />
        ))}
      </div>
    </section>
  );
}
