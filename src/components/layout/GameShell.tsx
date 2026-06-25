"use client";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface GameShellProps {
  children: React.ReactNode;
  cashBalance: number;
  balanceUsd: number;
  companyName?: string;
  isAdmin: boolean;
}

export default function GameShell({ children, cashBalance: initCash, balanceUsd: initUsd, companyName: initCompany, isAdmin }: GameShellProps) {
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [cashBalance,  setCashBalance]  = useState(initCash);
  const [balanceUsd,   setBalanceUsd]   = useState(initUsd);
  const [companyName,  setCompanyName]  = useState(initCompany);

  const close  = useCallback(() => setSidebarOpen(false), []);
  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);

  // Refresh balance from API
  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/player/balance", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setCashBalance(d.cashBalance ?? 0);
        setBalanceUsd(d.balanceUsd   ?? 0);
        if (d.companyName) setCompanyName(d.companyName);
      }
    } catch { /* ignore */ }
  }, []);

  // Refresh unread notification count
  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?take=1", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setUnreadCount(d.unreadCount ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  // Poll balance every 30s, unread every 60s
  useEffect(() => {
    refreshBalance();
    refreshUnread();
    const balId   = setInterval(refreshBalance, 30_000);
    const notifId = setInterval(refreshUnread,  60_000);
    return () => { clearInterval(balId); clearInterval(notifId); };
  }, [refreshBalance, refreshUnread]);

  // Refresh on game tick (SSE) or manual transaction events
  useEffect(() => {
    const onTick    = () => { refreshBalance(); refreshUnread(); };
    const onBalance = () => refreshBalance();
    window.addEventListener("game:tick",    onTick);
    window.addEventListener("game:balance", onBalance);
    return () => {
      window.removeEventListener("game:tick",    onTick);
      window.removeEventListener("game:balance", onBalance);
    };
  }, [refreshBalance, refreshUnread]);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setUnreadCount(0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={close} />
      )}

      <Sidebar isAdmin={isAdmin} isOpen={sidebarOpen} onClose={close} unreadCount={unreadCount} />

      <TopBar
        cashBalance={cashBalance}
        balanceUsd={balanceUsd}
        companyName={companyName}
        onMenuToggle={toggle}
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
      />

      <main className="lg:ml-60 pt-14 min-h-screen">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
