"use client";

import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { formatUAH, formatUSD } from "@/lib/utils";

interface TopBarProps {
  cashBalance?: number;
  balanceUsd?: number;
  companyName?: string;
  onMenuToggle?: () => void;
}

export default function TopBar({ cashBalance = 0, balanceUsd = 0, companyName, onMenuToggle }: TopBarProps) {
  const { data: session } = useSession();

  return (
    <header className="fixed top-0 left-0 lg:left-60 right-0 h-14 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-4 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label="Відкрити меню"
        >
          <Menu size={20} />
        </button>

        <div className="text-sm hidden sm:block">
          {companyName ? (
            <span className="text-white font-semibold">{companyName}</span>
          ) : (
            <span className="text-gray-500 italic">Компанія не налаштована</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* UAH balance */}
        <div className="flex items-center gap-1.5 bg-gray-800 px-2.5 py-1.5 rounded-lg">
          <span className="text-yellow-400 font-bold text-sm">₴</span>
          <span className="text-sm font-mono font-semibold text-yellow-300">
            {cashBalance >= 1_000_000
              ? `${(cashBalance / 1_000_000).toFixed(1)}M`
              : cashBalance >= 1_000
              ? `${(cashBalance / 1_000).toFixed(0)}K`
              : cashBalance.toFixed(0)}
          </span>
        </div>

        {/* USD balance */}
        <div className="flex items-center gap-1.5 bg-gray-800 px-2.5 py-1.5 rounded-lg">
          <span className="text-emerald-400 font-bold text-sm">$</span>
          <span className="text-sm font-mono font-semibold text-emerald-300">
            {balanceUsd >= 1_000
              ? `${(balanceUsd / 1_000).toFixed(0)}K`
              : balanceUsd.toFixed(0)}
          </span>
        </div>

        {/* User avatar */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-sm text-gray-300 hidden md:block">{session?.user?.name}</span>
        </div>
      </div>
    </header>
  );
}
