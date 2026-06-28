"use client";
import { cn } from "@/lib/utils";

interface Props {
  tickNumber: number;
  seasonIndex: number;
  currentCropSku: string | null;
}

const SEASONS = [
  { name: "🌸 Весна",  color: "bg-emerald-600", ticks: [0, 29]   },
  { name: "☀️ Літо",   color: "bg-yellow-500",  ticks: [30, 59]  },
  { name: "🍂 Осінь",  color: "bg-orange-600",  ticks: [60, 89]  },
  { name: "❄️ Зима",   color: "bg-blue-600",    ticks: [90, 119] },
];

const CROP_WINDOWS: Record<string, { sow: [number,number]; harvest: [number,number]; name: string }> = {
  "RM-WHEAT":   { name: "Пшениця",    sow: [0, 4],   harvest: [20, 29]  },
  "RM-SUNFL":   { name: "Соняшник",   sow: [30, 35],  harvest: [55, 59]  },
  "RM-SUGBEET": { name: "Буряк",      sow: [35, 45],  harvest: [70, 89]  },
  "RM-CORN":    { name: "Кукурудза",  sow: [32, 42],  harvest: [60, 75]  },
};

export default function SeasonalPlanner({ tickNumber, seasonIndex, currentCropSku }: Props) {
  const tickInYear = tickNumber % 120;
  const positionPct = (tickInYear / 120) * 100;

  const cropInfo = currentCropSku ? CROP_WINDOWS[currentCropSku] : null;

  // Countdown to next spring (tick 0 of next year)
  const ticksToSpring = tickInYear === 0 ? 0 : 120 - tickInYear;
  const ticksInSeason = 30 - (tickInYear % 30);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white">Планувальник сезону</p>
        <span className="text-[10px] text-gray-500 font-mono">тік {tickInYear}/120</span>
      </div>

      {/* 120-tick year timeline */}
      <div className="relative">
        <div className="flex h-3 rounded-full overflow-hidden gap-px">
          {SEASONS.map((s, i) => (
            <div key={i} className={cn("flex-1 relative", s.color, "opacity-60")} />
          ))}
        </div>

        {/* Sow/harvest windows for current crop */}
        {cropInfo && (
          <div className="absolute top-0 h-3 rounded-sm opacity-80 border-2 border-white/60"
            style={{
              left:  `${(cropInfo.sow[0] / 120) * 100}%`,
              width: `${((cropInfo.harvest[1] - cropInfo.sow[0]) / 120) * 100}%`,
            }}
          />
        )}

        {/* Current tick marker */}
        <div
          className="absolute top-[-3px] w-0.5 h-[18px] bg-white rounded-full shadow-lg shadow-white/30"
          style={{ left: `${positionPct}%` }}
        />
      </div>

      {/* Season labels */}
      <div className="flex text-[9px] text-gray-500">
        {SEASONS.map((s, i) => (
          <div key={i} className={cn("flex-1 text-center", i === seasonIndex && "text-white font-medium")}>{s.name}</div>
        ))}
      </div>

      {/* Countdown row */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded bg-gray-800/50 px-2 py-1.5">
          <p className="text-gray-500">До кінця сезону</p>
          <p className="font-mono text-white font-semibold">{ticksInSeason} тік{ticksInSeason === 1 ? "" : "ів"}</p>
        </div>
        <div className="rounded bg-gray-800/50 px-2 py-1.5">
          <p className="text-gray-500">До нової весни</p>
          <p className="font-mono text-white font-semibold">{ticksToSpring === 0 ? "Зараз!" : `${ticksToSpring} тіків`}</p>
        </div>
      </div>

      {/* Crop schedule table */}
      <div className="space-y-1">
        <p className="text-[9px] text-gray-600 uppercase tracking-wider">Оптимальні вікна посіву</p>
        {Object.entries(CROP_WINDOWS).map(([sku, c]) => {
          const inSow     = tickInYear >= c.sow[0] && tickInYear <= c.sow[1];
          const inHarvest = tickInYear >= c.harvest[0] && tickInYear <= c.harvest[1];
          const isCurrent = sku === currentCropSku;
          return (
            <div key={sku} className={cn("flex items-center gap-2 rounded px-2 py-1 text-[10px]", isCurrent ? "bg-emerald-950/40 border border-emerald-800/30" : "")}>
              <span className={cn("w-20 truncate", isCurrent ? "text-emerald-300 font-medium" : "text-gray-400")}>{c.name}</span>
              <div className="flex-1 flex gap-1 items-center">
                <span className={cn("px-1 py-0.5 rounded text-[8px]", inSow ? "bg-emerald-700 text-white" : "bg-gray-800 text-gray-500")}>
                  Сів т{c.sow[0]}–{c.sow[1]}
                </span>
                <span className={cn("px-1 py-0.5 rounded text-[8px]", inHarvest ? "bg-amber-700 text-white" : "bg-gray-800 text-gray-500")}>
                  Збір т{c.harvest[0]}–{c.harvest[1]}
                </span>
                {inSow     && <span className="text-[9px] text-emerald-400 animate-pulse">← ЗАРАЗ</span>}
                {inHarvest && <span className="text-[9px] text-amber-400 animate-pulse">← ЗБИРАЙ</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
