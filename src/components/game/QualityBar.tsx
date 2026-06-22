import { cn } from "@/lib/utils";

interface QualityBarProps {
  value: number;    // 0..10
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

function qualityColor(v: number): string {
  if (v >= 8)  return "bg-emerald-500";
  if (v >= 6)  return "bg-green-500";
  if (v >= 4)  return "bg-amber-500";
  if (v >= 2)  return "bg-orange-500";
  return "bg-red-600";
}

function qualityLabel(v: number): string {
  if (v >= 8)  return "Відмінна";
  if (v >= 6)  return "Хороша";
  if (v >= 4)  return "Середня";
  if (v >= 2)  return "Низька";
  return "Жахлива";
}

export function QualityBar({ value, max = 10, showLabel = true, size = "md", className }: QualityBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const h   = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("flex-1 bg-gray-800 rounded-full overflow-hidden", h)}>
        <div
          className={cn("h-full rounded-full transition-all", qualityColor(value))}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-400 w-16 shrink-0">
          {value.toFixed(1)} — {qualityLabel(value)}
        </span>
      )}
    </div>
  );
}

export function EfficiencyBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, (value / 2) * 100);
  const color = value >= 1.2 ? "bg-emerald-500" : value >= 0.8 ? "bg-blue-500" : "bg-amber-500";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 bg-gray-800 rounded-full overflow-hidden h-2">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-10 shrink-0">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}
