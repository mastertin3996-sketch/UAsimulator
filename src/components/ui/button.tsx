import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

const variants = {
  default:     "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700",
  outline:     "border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white",
  ghost:       "text-gray-400 hover:bg-gray-800 hover:text-white",
  destructive: "bg-red-700 text-white hover:bg-red-600 active:bg-red-800",
  secondary:   "bg-gray-800 text-gray-200 hover:bg-gray-700",
  premium:     "bg-violet-700 text-white hover:bg-violet-600",
};

const sizes = {
  sm:   "h-8  px-3 text-xs  gap-1.5",
  md:   "h-9  px-4 text-sm  gap-2",
  lg:   "h-11 px-6 text-base gap-2",
  icon: "h-9  w-9  text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export { Button };
