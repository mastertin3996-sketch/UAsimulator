"use client";
import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, CheckCircle2, Info, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  at: number;
};

const TYPE_STYLE: Record<string, { icon: React.ReactNode; border: string; bg: string }> = {
  WARNING:          { icon: <AlertTriangle size={14} className="text-amber-400 shrink-0" />, border: "border-amber-700/60", bg: "bg-amber-950/80" },
  MACRO_EVENT:      { icon: <AlertTriangle size={14} className="text-orange-400 shrink-0" />, border: "border-orange-700/60", bg: "bg-orange-950/80" },
  STRIKE:           { icon: <AlertTriangle size={14} className="text-red-400 shrink-0" />,    border: "border-red-700/60",    bg: "bg-red-950/80" },
  EQUIPMENT_BROKEN: { icon: <AlertTriangle size={14} className="text-red-400 shrink-0" />,    border: "border-red-700/60",    bg: "bg-red-950/80" },
  EQUIPMENT_WORN:   { icon: <AlertTriangle size={14} className="text-amber-400 shrink-0" />,  border: "border-amber-700/60", bg: "bg-amber-950/80" },
  CONSTRUCTION_COMPLETE: { icon: <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />, border: "border-emerald-700/60", bg: "bg-emerald-950/80" },
  LICENSE_EXPIRY:   { icon: <AlertTriangle size={14} className="text-yellow-400 shrink-0" />, border: "border-yellow-700/60", bg: "bg-yellow-950/80" },
};
const DEFAULT_STYLE = { icon: <Info size={14} className="text-blue-400 shrink-0" />, border: "border-blue-700/60", bg: "bg-blue-950/80" };

const POLL_INTERVAL = 60_000; // 1 хвилина
const TOAST_TTL     = 7_000;  // 7 секунд

export default function ToastAlerts() {
  const [toasts, setToasts]   = useState<ToastItem[]>([]);
  const seenIds               = useRef<Set<string>>(new Set());
  const lastPoll              = useRef<number>(Date.now());

  function dismiss(id: string) {
    setToasts(t => t.filter(x => x.id !== id));
  }

  async function poll() {
    try {
      const res  = await fetch("/api/notifications?unread=true&take=20");
      if (!res.ok) return;
      const data = await res.json();
      const now  = Date.now();
      const cutoff = lastPoll.current - 5_000; // 5s grace

      const fresh: ToastItem[] = (data.notifications ?? [])
        .filter((n: any) => !seenIds.current.has(n.id) && new Date(n.createdAt).getTime() > cutoff)
        .map((n: any) => ({ id: n.id, type: n.type, title: n.title, body: n.body, at: now }));

      if (fresh.length > 0) {
        fresh.forEach(t => seenIds.current.add(t.id));
        setToasts(prev => [...fresh.slice(0, 3), ...prev].slice(0, 5));
      }
      lastPoll.current = now;
    } catch { /* ignore */ }
  }

  useEffect(() => {
    // Перший виклик через 5 сек після монтажу (дати сторінці завантажитись)
    const init = setTimeout(poll, 5_000);
    const id   = setInterval(poll, POLL_INTERVAL);
    return () => { clearTimeout(init); clearInterval(id); };
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(t => now - t.at < TOAST_TTL));
    }, 1_000);
    return () => clearInterval(id);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => {
        const style = TYPE_STYLE[t.type] ?? DEFAULT_STYLE;
        const age   = Date.now() - t.at;
        const fading = age > TOAST_TTL - 1_500;
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-2xl backdrop-blur-sm transition-all duration-500",
              style.border, style.bg,
              fading ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
            )}
          >
            <div className="mt-0.5">{style.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{t.title}</p>
              <p className="text-[10px] text-gray-300 mt-0.5 line-clamp-2">{t.body}</p>
            </div>
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-gray-600 hover:text-gray-400 mt-0.5">
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
