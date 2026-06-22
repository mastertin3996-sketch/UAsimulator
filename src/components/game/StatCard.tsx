import { cn } from "@/lib/utils";
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  trend?: number;        // % зміна відносно попереднього тіку
  trendLabel?: string;
  iconColor?: string;
  iconBg?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  trendLabel,
  iconColor = "text-emerald-400",
  iconBg = "bg-emerald-950",
  className,
}: StatCardProps) {
  const hasTrend = trend !== undefined;
  const isUp   = hasTrend && trend > 0;
  const isDown  = hasTrend && trend < 0;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <div className={cn("bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between">
        <div className={cn("p-2.5 rounded-lg", iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
        {hasTrend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              isUp   && "text-green-400 bg-green-950",
              isDown && "text-red-400 bg-red-950",
              !isUp && !isDown && "text-gray-500 bg-gray-800",
            )}
          >
            <TrendIcon size={11} />
            {hasTrend ? `${Math.abs(trend).toFixed(1)}%` : "—"}
          </div>
        )}
      </div>

      <div>
        <div className="text-2xl font-bold text-white font-mono tracking-tight">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {subtext && <div className="text-xs text-gray-600 mt-1">{subtext}</div>}
        {trendLabel && (
          <div className="text-xs text-gray-600 mt-1">{trendLabel}</div>
        )}
      </div>
    </div>
  );
}
