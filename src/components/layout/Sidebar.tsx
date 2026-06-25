"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, ShoppingCart, Warehouse,
  TrendingUp, FlaskConical, Trophy, BarChart2, Settings,
  UsersRound, LogOut, ShieldAlert, Truck, Bot, Factory,
  ScrollText, Tag, History, Landmark, CandlestickChart, Banknote,
  Bell, Wallet, GraduationCap, Users, Cpu, X, BadgeCheck, MapPin, Globe,
} from "lucide-react";
import { signOut } from "next-auth/react";

interface NavItem { href: string; label: string; icon: React.FC<{ size?: number; className?: string }> }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Головна",
    items: [
      { href: "/dashboard",     label: "Дашборд",    icon: LayoutDashboard },
      { href: "/notifications", label: "Сповіщення", icon: Bell },
    ],
  },
  {
    label: "Виробництво",
    items: [
      { href: "/enterprises",        label: "Підприємства", icon: Building2 },
      { href: "/land",               label: "Земля",        icon: MapPin },
      { href: "/employees",          label: "Персонал",     icon: UsersRound },
      { href: "/qualification",      label: "Кваліфікація", icon: GraduationCap },
      { href: "/research",           label: "Дослідження",  icon: FlaskConical },
      { href: "/production-history", label: "Виробництво",  icon: Factory },
      { href: "/warehouses",         label: "Склади",       icon: Warehouse },
      { href: "/licenses",           label: "Ліцензії",     icon: BadgeCheck },
    ],
  },
  {
    label: "Торгівля",
    items: [
      { href: "/market",         label: "Ринок",      icon: ShoppingCart },
      { href: "/my-offers",      label: "Мої оферти", icon: Tag },
      { href: "/market-history", label: "Угоди",      icon: History },
      { href: "/contracts",      label: "Контракти",  icon: ScrollText },
      { href: "/supply-routes",  label: "Постачання", icon: Truck },
      { href: "/auto-replenish", label: "Автозакупка",icon: Bot },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { href: "/finances",       label: "Фінанси",    icon: TrendingUp },
      { href: "/banking",        label: "Банківська", icon: Banknote },
      { href: "/wallet",         label: "Гаманець",   icon: Wallet },
      { href: "/stock-exchange", label: "Біржа",      icon: CandlestickChart },
      { href: "/foreign-trade",  label: "Зовн. торгівля", icon: Globe },
    ],
  },
  {
    label: "Компанія",
    items: [
      { href: "/ma",        label: "M&A",         icon: Landmark },
      { href: "/syndicate", label: "Синдикат",    icon: Users },
      { href: "/optimizer", label: "Оптимізатор", icon: Cpu },
      { href: "/ratings",   label: "Рейтинги",    icon: Trophy },
      { href: "/analytics", label: "Аналітика",   icon: BarChart2 },
      { href: "/settings",  label: "Налаштування",icon: Settings },
    ],
  },
];

interface SidebarProps { isAdmin?: boolean; isOpen?: boolean; onClose?: () => void; unreadCount?: number }

export default function Sidebar({ isAdmin = false, isOpen = false, onClose, unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen w-60 bg-gray-900 text-gray-100 flex flex-col z-40 transition-transform duration-200",
      "lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
    )}>
      {/* Logo + mobile close */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold tracking-tight text-emerald-400">UA Simulator</span>
          <span className="block text-[10px] text-gray-500 mt-0.5">Economic Simulator</span>
        </div>
        <button onClick={onClose} className="lg:hidden p-1 rounded text-gray-500 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => (
          <div key={label} className="mb-4">
            <p className="px-3 mb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{label}</p>
            <div className="space-y-0.5">
              {items.map(({ href, label: itemLabel, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive(href)
                      ? "bg-emerald-600 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white",
                  )}
                >
                  <Icon size={15} />
                  <span className="flex-1">{itemLabel}</span>
                  {href === "/notifications" && unreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div className="mb-4">
            <p className="px-3 mb-1 text-[10px] font-semibold text-red-700 uppercase tracking-widest">Адмін</p>
            <Link
              href="/admin/gm"
              onClick={onClose}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith("/admin/gm")
                  ? "bg-red-700 text-white"
                  : "text-red-400 hover:bg-red-950 hover:text-red-300",
              )}
            >
              <ShieldAlert size={15} />
              Панель GM
            </Link>
          </div>
        )}
      </nav>

      {/* Logout */}
      <div className="px-2 pb-3 border-t border-gray-800 pt-2">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={15} />
          Вийти
        </button>
      </div>
    </aside>
  );
}
