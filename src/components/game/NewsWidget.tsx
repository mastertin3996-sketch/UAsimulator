"use client";

import { useCallback, useEffect, useState } from "react";
import { Newspaper, TrendingUp, TrendingDown, Minus, Clock, Zap, ShoppingCart, DollarSign, Factory } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GameEvent {
  id             : string;
  title          : string;
  description    : string;
  targetType     : "CITY" | "PRODUCT" | "GLOBAL";
  modifierType   : "DEMAND" | "PRICE" | "COST" | "EFFICIENCY";
  valueMultiplier: number;
  ticksRemaining : number;
  durationTicks  : number;
  sentiment      : "POSITIVE" | "NEGATIVE" | "NEUTRAL";
}

// ── Config ─────────────────────────────────────────────────────────────────────

const MODIFIER_META: Record<string, { label: string; Icon: React.ElementType }> = {
  DEMAND    : { label: "Попит",        Icon: ShoppingCart },
  PRICE     : { label: "Ціна",         Icon: DollarSign   },
  COST      : { label: "Витрати",      Icon: Factory      },
  EFFICIENCY: { label: "Ефективність", Icon: Zap          },
};

const SENTIMENT_STYLE = {
  POSITIVE: {
    border : "border-l-emerald-500",
    bg     : "bg-emerald-950/40",
    badge  : "bg-emerald-900/60 text-emerald-300",
    timer  : "text-emerald-400",
    icon   : TrendingUp,
    iconCls: "text-emerald-400",
  },
  NEGATIVE: {
    border : "border-l-red-500",
    bg     : "bg-red-950/40",
    badge  : "bg-red-900/60 text-red-300",
    timer  : "text-red-400",
    icon   : TrendingDown,
    iconCls: "text-red-400",
  },
  NEUTRAL: {
    border : "border-l-amber-500",
    bg     : "bg-amber-950/30",
    badge  : "bg-amber-900/60 text-amber-300",
    timer  : "text-amber-400",
    icon   : Minus,
    iconCls: "text-amber-400",
  },
};

// ── Event Card ─────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: GameEvent }) {
  const style     = SENTIMENT_STYLE[event.sentiment];
  const meta      = MODIFIER_META[event.modifierType];
  const SentIcon  = style.icon;
  const ModIcon   = meta.Icon;
  const pct       = Math.round((event.valueMultiplier - 1) * 100);
  const pctStr    = pct >= 0 ? `+${pct}%` : `${pct}%`;
  const progress  = event.ticksRemaining / event.durationTicks;

  return (
    <div className={cn(
      "rounded-lg border-l-4 border border-gray-800 p-3 space-y-2 transition-all",
      style.border,
      style.bg,
    )}>
      {/* Title row */}
      <div className="flex items-start gap-2">
        <SentIcon size={14} className={cn("mt-0.5 shrink-0", style.iconCls)} />
        <p className="text-sm font-semibold text-white leading-snug">{event.title}</p>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 leading-relaxed pl-4">{event.description}</p>

      {/* Badges + timer */}
      <div className="flex items-center justify-between gap-2 pl-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", style.badge)}>
            <ModIcon size={10} />
            {meta.label} {pctStr}
          </span>
          <span className="text-xs text-gray-600 bg-gray-800/60 px-2 py-0.5 rounded-full">
            {event.targetType === "GLOBAL" ? "Глобально" : event.targetType === "CITY" ? "Місто" : "Продукт"}
          </span>
        </div>

        <div className={cn("flex items-center gap-1 text-xs font-mono shrink-0", style.timer)}>
          <Clock size={10} />
          {event.ticksRemaining} тік{event.ticksRemaining === 1 ? "" : "ів"}
        </div>
      </div>

      {/* Progress bar */}
      <div className="pl-4">
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              event.sentiment === "POSITIVE" ? "bg-emerald-500" :
              event.sentiment === "NEGATIVE" ? "bg-red-500" : "bg-amber-500",
            )}
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

export default function NewsWidget() {
  const [events,  setEvents]  = useState<GameEvent[]>([]);
  const [tick,    setTick]    = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/game-events/active")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setTick(data.currentTick ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-2">
          <Newspaper size={16} className="text-amber-400" />
          <span className="text-sm font-semibold text-white">Фінансова газета</span>
        </div>
        <span className="text-xs text-gray-500 font-mono">Тік #{tick}</span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 min-h-[120px]">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-gray-800 p-3 animate-pulse space-y-2">
                <div className="h-3 bg-gray-800 rounded w-3/4" />
                <div className="h-2 bg-gray-800 rounded w-full" />
                <div className="h-2 bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
            <Newspaper size={24} className="text-gray-700" />
            <p className="text-sm text-gray-500">Ринок спокійний</p>
            <p className="text-xs text-gray-600">Жодних активних подій</p>
          </div>
        ) : (
          events.map((ev) => <EventCard key={ev.id} event={ev} />)
        )}
      </div>

      {/* Footer with legend */}
      {!loading && events.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1"><TrendingUp size={10} className="text-emerald-500" /> Бум</span>
          <span className="flex items-center gap-1"><TrendingDown size={10} className="text-red-500" /> Криза</span>
          <span className="flex items-center gap-1"><Minus size={10} className="text-amber-500" /> Нейтральна</span>
        </div>
      )}
    </div>
  );
}
