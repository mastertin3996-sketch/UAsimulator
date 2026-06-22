"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, ShoppingCart, Warehouse,
  TrendingUp, FlaskConical, Trophy, BarChart2, Settings,
  UsersRound, LogOut, ShieldAlert, Truck, Bot, Factory, ScrollText, Tag, History, Landmark, CandlestickChart, Banknote,
} from "lucide-react";
import { signOut } from "next-auth/react";

const NAV_ITEMS = [
  { href: "/dashboard",          label: "Дашборд",       icon: LayoutDashboard },
  { href: "/enterprises",        label: "Підприємства",  icon: Building2 },
  { href: "/market",             label: "Ринок",         icon: ShoppingCart },
  { href: "/my-offers",          label: "Мої оферти",    icon: Tag },
  { href: "/market-history",     label: "Угоди",         icon: History },
  { href: "/warehouses",         label: "Склади",        icon: Warehouse },
  { href: "/supply-routes",      label: "Постачання",    icon: Truck },
  { href: "/auto-replenish",     label: "Автозакупка",   icon: Bot },
  { href: "/production-history", label: "Виробництво",   icon: Factory },
  { href: "/contracts",          label: "Контракти",     icon: ScrollText },
  { href: "/finances",           label: "Фінанси",       icon: TrendingUp },
  { href: "/banking",            label: "Банківська",    icon: Banknote },
  { href: "/stock-exchange",     label: "Біржа",         icon: CandlestickChart },
  { href: "/ma",                 label: "M&A",           icon: Landmark },
  { href: "/employees",          label: "Персонал",      icon: UsersRound },
  { href: "/research",           label: "Дослідження",   icon: FlaskConical },
  { href: "/ratings",            label: "Рейтинги",      icon: Trophy },
  { href: "/analytics",          label: "Аналітика",     icon: BarChart2 },
  { href: "/settings",           label: "Налаштування",  icon: Settings },
];

export default function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-gray-900 text-gray-100 flex flex-col z-40">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-xl font-bold tracking-tight text-emerald-400">UA Simulator</span>
        <span className="block text-xs text-gray-500 mt-0.5">Economic Simulator</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
                ? "bg-emerald-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white",
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <div className="pt-2 mt-2 border-t border-gray-800">
            <Link
              href="/admin/gm"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith("/admin/gm")
                  ? "bg-red-700 text-white"
                  : "text-red-400 hover:bg-red-950 hover:text-red-300",
              )}
            >
              <ShieldAlert size={18} />
              Панель GM
            </Link>
          </div>
        )}
      </nav>

      <div className="px-3 pb-4">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Вийти
        </button>
      </div>
    </aside>
  );
}
