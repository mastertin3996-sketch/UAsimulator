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

export default function GameShell({ children, cashBalance, balanceUsd, companyName, isAdmin }: GameShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const close  = useCallback(() => setSidebarOpen(false), []);
  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);

  // Fetch unread count on mount and every 60s
  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?take=1", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshUnread();
    const id = setInterval(refreshUnread, 60_000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  // Listen for tick SSE events dispatched by DashboardClient
  useEffect(() => {
    const handler = () => refreshUnread();
    window.addEventListener("game:tick", handler);
    return () => window.removeEventListener("game:tick", handler);
  }, [refreshUnread]);

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
