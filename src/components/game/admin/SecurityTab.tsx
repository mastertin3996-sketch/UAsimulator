"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert, ShieldCheck, Skull, RefreshCw,
  AlertTriangle, UserX, CheckCheck, Clock,
} from "lucide-react";

interface SecurityAlert {
  id: string; createdAt: string; type: string; status: string;
  actorId: string; targetId: string | null; details: Record<string, unknown>;
  resolvedAt: string | null; resolvedBy: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN      : "bg-red-950 text-red-400 border-red-800",
  REVIEWING : "bg-amber-950 text-amber-400 border-amber-800",
  RESOLVED  : "bg-emerald-950 text-emerald-400 border-emerald-800",
  DISMISSED : "bg-gray-800 text-gray-500 border-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN      : "Відкрито",
  REVIEWING : "Перевірка",
  RESOLVED  : "Вирішено",
  DISMISSED : "Відхилено",
};

const TYPE_LABELS: Record<string, string> = {
  SUSPICIOUS_TRANSFER: "Підозрілий контракт",
  MULTI_ACCOUNT      : "Мульти-акаунт",
};

const FILTER_TABS = [
  { value: "",           label: "Всі" },
  { value: "OPEN",      label: "Відкриті" },
  { value: "REVIEWING", label: "Перевірка" },
  { value: "RESOLVED",  label: "Вирішені" },
  { value: "DISMISSED", label: "Відхилені" },
];

function elapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 60)   return `${min}хв тому`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `${h}г тому`;
  return `${Math.floor(h / 24)}д тому`;
}

export default function SecurityTab() {
  const [alerts, setAlerts]     = useState<SecurityAlert[]>([]);
  const [filter, setFilter]     = useState("");
  const [total, setTotal]       = useState(0);
  const [flagged, setFlagged]   = useState(0);
  const [loading, setLoad]      = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAlerts = useCallback(async (status: string) => {
    setLoad(true);
    try {
      const q = status ? `?status=${status}` : "";
      const r = await fetch(`/api/admin/security${q}`);
      if (r.ok) {
        const d = await r.json();
        setAlerts(d.alerts);
        setTotal(d.alerts.length);
        setFlagged(d.totalFlagged);
      }
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { loadAlerts(filter); }, [filter, loadAlerts]);

  const handleApprove = async (alertId: string) => {
    setBusyId(alertId);
    try {
      const r = await fetch("/api/admin/security", {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ alertId, status: "DISMISSED", unflagUsers: true }),
      });
      if (r.ok) {
        showToast("Транзакція затверджена, прапорці зняті", true);
        loadAlerts(filter);
      } else { const d = await r.json(); showToast(d.error, false); }
    } finally { setBusyId(null); }
  };

  const handleReviewing = async (alertId: string) => {
    setBusyId(alertId);
    try {
      await fetch("/api/admin/security", {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ alertId, status: "REVIEWING" }),
      });
      loadAlerts(filter);
    } finally { setBusyId(null); }
  };

  const handleConfiscate = async (alert: SecurityAlert) => {
    if (!confirm(`Конфіскувати активи у гравця ${alert.actorId}? Це обнулить їх GC-баланс.`)) return;
    setBusyId(alert.id);
    try {
      const r = await fetch(`/api/admin/security/${alert.id}/confiscate`, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        showToast(`Конфісковано ${d.confiscatedGC.toLocaleString()} GC`, true);
        loadAlerts(filter);
      } else { showToast(d.error, false); }
    } finally { setBusyId(null); }
  };

  const openCount = alerts.filter((a) => a.status === "OPEN").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl border p-4 ${openCount > 0 ? "bg-red-950/30 border-red-800" : "bg-gray-900 border-gray-800"}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Відкриті алерти</p>
          <p className={`text-3xl font-bold mt-1 ${openCount > 0 ? "text-red-400" : "text-white"}`}>{openCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Всього алертів</p>
          <p className="text-3xl font-bold text-white mt-1">{total}</p>
        </div>
        <div className={`rounded-xl border p-4 ${flagged > 0 ? "bg-amber-950/30 border-amber-800" : "bg-gray-900 border-gray-800"}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Заприм. гравців</p>
          <p className={`text-3xl font-bold mt-1 ${flagged > 0 ? "text-amber-400" : "text-white"}`}>{flagged}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {FILTER_TABS.map(({ value, label }) => (
          <button key={value} onClick={() => setFilter(value)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === value
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}>
            {label}
          </button>
        ))}
        <button onClick={() => loadAlerts(filter)}
          className="px-3 text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Alert cards */}
      {loading && alerts.length === 0 && (
        <div className="text-center py-12 text-gray-600">Завантаження...</div>
      )}
      {!loading && alerts.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <ShieldCheck size={40} className="mx-auto mb-3 text-gray-700" />
          Алертів не знайдено
        </div>
      )}

      <div className="space-y-3">
        {alerts.map((alert) => {
          const isOpen = alert.status === "OPEN";
          const isExpanded = expanded === alert.id;

          return (
            <div key={alert.id}
              className={`bg-gray-900 rounded-xl border overflow-hidden transition-all ${
                isOpen ? "border-red-800/60" : "border-gray-800"
              }`}>
              {/* Card header */}
              <div
                className="flex items-start gap-4 p-4 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : alert.id)}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isOpen
                    ? "bg-red-950 text-red-400"
                    : alert.status === "RESOLVED"
                    ? "bg-emerald-950 text-emerald-400"
                    : "bg-gray-800 text-gray-500"
                }`}>
                  {alert.type === "MULTI_ACCOUNT" ? <UserX size={18} /> : <ShieldAlert size={18} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                      alert.type === "MULTI_ACCOUNT"
                        ? "bg-amber-950 text-amber-400 border-amber-800"
                        : "bg-red-950 text-red-400 border-red-800"
                    }`}>
                      {TYPE_LABELS[alert.type] ?? alert.type}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_COLORS[alert.status]}`}>
                      {STATUS_LABELS[alert.status] ?? alert.status}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />{elapsed(alert.createdAt)}
                    </span>
                    <span>Актор: <span className="text-gray-300 font-mono">{alert.actorId.slice(-8)}</span></span>
                    {alert.targetId && (
                      <span>Ціль: <span className="text-gray-300 font-mono">{alert.targetId.slice(-8)}</span></span>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      title="Взяти в перевірку"
                      onClick={(e) => { e.stopPropagation(); handleReviewing(alert.id); }}
                      disabled={busyId === alert.id}
                      className="p-2 rounded-lg bg-amber-950 text-amber-400 hover:bg-amber-900 transition-colors disabled:opacity-50">
                      <AlertTriangle size={16} />
                    </button>
                    <button
                      title="Затвердити транзакцію (чиста угода)"
                      onClick={(e) => { e.stopPropagation(); handleApprove(alert.id); }}
                      disabled={busyId === alert.id}
                      className="p-2 rounded-lg bg-emerald-950 text-emerald-400 hover:bg-emerald-900 transition-colors disabled:opacity-50">
                      <CheckCheck size={16} />
                    </button>
                    <button
                      title="Конфіскувати активи"
                      onClick={(e) => { e.stopPropagation(); handleConfiscate(alert); }}
                      disabled={busyId === alert.id}
                      className="p-2 rounded-lg bg-red-950 text-red-400 hover:bg-red-900 transition-colors disabled:opacity-50">
                      <Skull size={16} />
                    </button>
                  </div>
                )}
                {alert.status === "REVIEWING" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      title="Затвердити"
                      onClick={(e) => { e.stopPropagation(); handleApprove(alert.id); }}
                      disabled={busyId === alert.id}
                      className="p-2 rounded-lg bg-emerald-950 text-emerald-400 hover:bg-emerald-900 transition-colors disabled:opacity-50">
                      <CheckCheck size={16} />
                    </button>
                    <button
                      title="Конфіскувати"
                      onClick={(e) => { e.stopPropagation(); handleConfiscate(alert); }}
                      disabled={busyId === alert.id}
                      className="p-2 rounded-lg bg-red-950 text-red-400 hover:bg-red-900 transition-colors disabled:opacity-50">
                      <Skull size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-gray-800 px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Деталі</p>
                  <pre className="text-xs text-gray-400 bg-gray-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(alert.details, null, 2)}
                  </pre>
                  {alert.resolvedBy && (
                    <p className="text-xs text-gray-600 mt-2">
                      Закрито: <span className="text-gray-500 font-mono">{alert.resolvedBy.slice(-8)}</span>
                      {" "}· {alert.resolvedAt ? elapsed(alert.resolvedAt) : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-xl z-50 ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}
