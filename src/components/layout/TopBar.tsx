"use client";

import { useSession } from "next-auth/react";
import { formatUAH, formatUSD } from "@/lib/utils";

interface TopBarProps {
  cashBalance?: number;
  balanceUsd?: number;
  companyName?: string;
}

export default function TopBar({ cashBalance = 0, balanceUsd = 0, companyName }: TopBarProps) {
  const { data: session } = useSession();

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 z-30">
      <div className="text-sm text-gray-400">
        {companyName ? (
          <span className="text-white font-semibold">{companyName}</span>
        ) : (
          <span className="text-gray-500 italic">Компанія не налаштована</span>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* UAH balance */}
        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg">
          <span className="text-yellow-400 font-bold text-sm">₴</span>
          <span className="text-sm font-mono font-semibold text-yellow-300">
            {formatUAH(cashBalance)}
          </span>
        </div>

        {/* USD balance */}
        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg">
          <span className="text-emerald-400 font-bold text-sm">$</span>
          <span className="text-sm font-mono font-semibold text-emerald-300">
            {formatUSD(balanceUsd)}
          </span>
        </div>

        {/* User avatar */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-bold text-white">
            {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-sm text-gray-300">{session?.user?.name}</span>
        </div>
      </div>
    </header>
  );
}
