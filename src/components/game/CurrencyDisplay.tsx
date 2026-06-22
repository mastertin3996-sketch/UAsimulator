import { cn } from "@/lib/utils";
import { CircleDollarSign, DollarSign } from "lucide-react";

interface CurrencyDisplayProps {
  amount: number;
  currency: "UAH" | "USD" | "GC" | "PC";
  size?: "sm" | "md" | "lg";
  className?: string;
  showSign?: boolean;
}

const textSizes = { sm: "text-sm", md: "text-base", lg: "text-xl" };
const iconSizes = { sm: 14, md: 16, lg: 20 };

export function CurrencyDisplay({ amount, currency, size = "md", className, showSign }: CurrencyDisplayProps) {
  const isUsd  = currency === "USD";
  const decimals = isUsd ? 2 : 0;
  const isPositive = amount > 0;
  const isNegative = amount < 0;

  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Math.abs(amount));

  const symbol = currency === "UAH" ? "₴" : currency === "USD" ? "$" : currency;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono font-semibold",
        textSizes[size],
        showSign && isPositive && "text-green-400",
        showSign && isNegative && "text-red-400",
        !showSign && currency === "UAH" && "text-emerald-400",
        !showSign && currency === "USD" && "text-blue-400",
        !showSign && currency === "GC"  && "text-amber-400",
        !showSign && currency === "PC"  && "text-violet-400",
        className,
      )}
    >
      {isUsd ? <DollarSign size={iconSizes[size]} className="shrink-0" /> : <CircleDollarSign size={iconSizes[size]} className="shrink-0" />}
      {showSign && isPositive && "+"}
      {showSign && isNegative && "−"}
      {formatted}
      {" "}{symbol}
    </span>
  );
}
