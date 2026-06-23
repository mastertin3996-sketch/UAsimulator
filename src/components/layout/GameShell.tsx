"use client";

import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface GameShellProps {
  children: React.ReactNode;
  cashBalance: number;
  balanceUsd: number;
  companyName?: string;
  isAdmin: boolean;
}

export default function GameShell({ children, cashBalance, balanceUsd, companyName, isAdmin }: GameShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = useCallback(() => setSidebarOpen(false), []);
  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={close}
        />
      )}

      <Sidebar isAdmin={isAdmin} isOpen={sidebarOpen} onClose={close} />

      <TopBar
        cashBalance={cashBalance}
        balanceUsd={balanceUsd}
        companyName={companyName}
        onMenuToggle={toggle}
      />

      <main className="lg:ml-60 pt-14 min-h-screen">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
