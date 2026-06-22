import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

const variants = {
  default:     "bg-gray-800 text-gray-300 border-gray-700",
  success:     "bg-green-950 text-green-400 border-green-900",
  warning:     "bg-amber-950 text-amber-400 border-amber-900",
  danger:      "bg-red-950 text-red-400 border-red-900",
  info:        "bg-blue-950 text-blue-400 border-blue-900",
  brand:       "bg-emerald-950 text-emerald-400 border-emerald-900",
  premium:     "bg-violet-950 text-violet-400 border-violet-900",
  extraction:  "bg-orange-950 text-orange-400 border-orange-900",
  production:  "bg-blue-950 text-blue-400 border-blue-900",
  trade:       "bg-emerald-950 text-emerald-400 border-emerald-900",
  logistics:   "bg-yellow-950 text-yellow-400 border-yellow-900",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
