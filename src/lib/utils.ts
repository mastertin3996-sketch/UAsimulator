import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUAH(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) + " ₴";
}

export function formatUSD(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return "$" + new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export function formatNumber(n: number | string) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("uk-UA").format(num);
}

export function formatPercent(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
