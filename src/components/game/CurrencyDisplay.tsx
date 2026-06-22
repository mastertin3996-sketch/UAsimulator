import { cn } from "@/lib/utils";
import { CircleDollarSign, Coins } from "lucide-react";

interface CurrencyDisplayProps {
  amount: number;
  currency: "GC" | "PC";
  size?: "sm" | "md" | "lg";
  className?: string;
  showSign?: boolean;
}

const textSizes = { sm: "text-sm", md: "text-base", lg: "text-xl" };
const iconSizes = { sm: 14, md: 16, lg: 20 };

export function CurrencyDisplay({
  amount,
  currency,
  size = "md",
  className,
  showSign,
}: CurrencyDisplayProps) {
  const isGC = currency === "GC";
  const isPositive = amount > 0;
  const isNegative = amount < 0;

  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: isGC ? 0 : 4,
  }).format(Math.abs(amount));

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono font-semibold",
        textSizes[size],
        showSign && isPositive && "text-green-400",
        showSign && isNegative && "text-red-400",
        !showSign && isGC && "text-amber-400",
        !showSign && !isGC && "text-violet-400",
        className,
      )}
    >
      {isGC ? (
        <CircleDollarSign size={iconSizes[size]} className="shrink-0" />
      ) : (
        <Coins size={iconSizes[size]} className="shrink-0" />
      )}
      {showSign && isPositive && "+"}
      {showSign && isNegative && "−"}
      {formatted}
      <span className="text-[0.7em] opacity-60">{currency}</span>
    </span>
  );
}
