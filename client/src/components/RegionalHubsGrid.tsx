import { MapPin, CheckCircle2, XCircle, Zap, Building } from 'lucide-react';
import type { CityHub } from '../types';
import { fmt } from '../types';

function ProgressBar({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 90 ? 'bg-red-500'    :
    pct >= 70 ? 'bg-amber-500'  :
    pct >= 50 ? 'bg-indigo-500' : 'bg-emerald-500';
  return (
    <div className={`h-2 w-full rounded-full bg-slate-700 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function RegionalHubsGrid({ hubs }: { hubs: CityHub[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
        <MapPin size={14} className="text-indigo-400" />
        Регіональні хаби
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {hubs.map(hub => {
          const { city, office, landPlots, enterprises } = hub;
          const totalLandM2 = landPlots.reduce((s, l) => s + l.totalAreaM2, 0);
          const usedLandM2  = landPlots.reduce((s, l) => s + l.usedAreaM2, 0);
          const landPct     = totalLandM2 > 0 ? usedLandM2 / totalLandM2 : 0;
          const enterpriseCount = enterprises.filter(e => e.type !== 'WAREHOUSE').length;
          const totalEmployees  = enterprises.flatMap(e => e.employees).length;
          const strikeCount     = enterprises.flatMap(e => e.employees).filter(e => e.isOnStrike).length;

          return (
            <div
              key={city.id}
              className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 flex flex-col gap-3"
            >
              {/* City header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white text-base">{city.nameUa}</h3>
                  <p className="text-xs text-slate-400">{city.region}</p>
                </div>
                <div className="flex gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                    Pop {(city.population / 1000).toFixed(0)}k
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${city.demandCoefficient >= 1.2 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-700 text-slate-300'}
                  `}>
                    Попит ×{city.demandCoefficient.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Office status */}
              <div className={`flex items-center justify-between rounded-lg p-3 border
                ${office?.isOperational
                  ? 'bg-emerald-950/30 border-emerald-800/40'
                  : 'bg-red-950/30 border-red-800/40'}
              `}>
                <div className="flex items-center gap-2">
                  {office?.isOperational
                    ? <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                    : <XCircle size={14} className="text-red-400 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-xs font-medium text-slate-300">
                      {office?.isOperational ? 'Офіс активний' : 'Офіс відсутній'}
                    </p>
                    {office?.isOperational && (
                      <p className="text-xs text-slate-500">
                        {office.sizeM2} м² · Оренда {fmt.uah(office.monthlyRentUah)}/міс
                      </p>
                    )}
                  </div>
                </div>
                {office?.isOperational && (
                  <div className="flex items-center gap-1 text-xs text-cyan-400">
                    <Zap size={11} />
                    <span className="tabular-nums">{fmt.kwh(office.energyConsumptionKwhPerTick)}/тік</span>
                  </div>
                )}
              </div>

              {/* Land utilization */}
              {landPlots.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Building size={11} />
                      Землекористування
                    </span>
                    <span className="text-xs text-slate-300 tabular-nums">
                      {fmt.fraction(Math.round(usedLandM2), Math.round(totalLandM2))} м²
                    </span>
                  </div>
                  <ProgressBar value={usedLandM2} max={totalLandM2} />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-slate-500">
                      {landPlots[0].status === 'OWNED' ? '🏛 Власна' : '📋 Оренда'}
                    </span>
                    <span className="text-xs text-slate-500">{fmt.pct(landPct)} зайнято</span>
                  </div>
                </div>
              )}

              {/* City metrics */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-700/40">
                <div className="text-center">
                  <p className="text-lg font-bold text-white tabular-nums">{enterpriseCount}</p>
                  <p className="text-xs text-slate-500">Підпр.</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-white tabular-nums">{totalEmployees}</p>
                  <p className="text-xs text-slate-500">Прац.</p>
                </div>
                <div className="text-center">
                  {strikeCount > 0
                    ? <p className="text-lg font-bold text-red-400 tabular-nums animate-pulse">{strikeCount}</p>
                    : <p className="text-lg font-bold text-emerald-400 tabular-nums">0</p>
                  }
                  <p className="text-xs text-slate-500">Страйк</p>
                </div>
              </div>

              {/* Wage baseline */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-700/40">
                <span>Міський мінімум ЗП</span>
                <span className="text-slate-300 tabular-nums font-medium">
                  {fmt.uah(city.wageBaselineUah)}/міс
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
