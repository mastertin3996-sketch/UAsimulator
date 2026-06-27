"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, Users, Building2, AlertTriangle,
  TrendingUp, TrendingDown, RefreshCw, Zap,
} from "lucide-react";

interface EcoStats {
  totalGC: number; totalPC: number;
  activeUsers: number; totalUsers: number;
  totalEnterprises: number;
  contractsActive: number; contractsTotal: number;
  flaggedUsers: number; openAlerts: number;
  currentTick: number;
}

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent: string;
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border ${accent} p-5 flex items-start gap-4`}>
      <div className={`p-2.5 rounded-lg ${accent.replace("border-", "bg-").replace("-700", "-900").replace("-600", "-900")}`}>
        <Icon size={22} className={accent.includes("emerald") ? "text-emerald-400" : accent.includes("blue") ? "text-blue-400" : accent.includes("amber") ? "text-amber-400" : "text-red-400"} />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function EcosystemTab() {
  const [stats, setStats]   = useState<EcoStats | null>(null);
  const [loading, setLoad]  = useState(true);
  const [emitOp, setEmitOp] = useState<"EMIT" | "BURN">("EMIT");
  const [currency, setCur]  = useState<"GC" | "PC">("GC");
  const [amount, setAmt]    = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy]     = useState(false);
  const [toast, setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

  const loadStats = useCallback(async () => {
    setLoad(true);
    try {
      const r = await fetch("/api/admin/ecosystem");
      if (r.ok) setStats(await r.json());
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const handleEmit = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0 || !reason.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/economy/emit", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ operation: emitOp, currency, amount: n, reason }),
      });
      const data = await r.json();
      if (r.ok) {
        showToast(`${emitOp === "EMIT" ? "Емісія" : "Спалення"}: ${fmt(data.totalDelta)} ${currency} (${data.affected} кор.)`, true);
        setAmt(""); setReason("");
        loadStats();
      } else { showToast(data.error ?? "Помилка", false); }
    } finally { setBusy(false); }
  };

  if (loading && !stats) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Завантаження...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Загалом GC" value={stats ? fmt(stats.totalGC) : "—"}
          sub="Грошова маса" icon={DollarSign} accent="border-emerald-700" />
        <StatCard label="Загалом PC" value={stats ? fmt(stats.totalPC) : "—"}
          sub="PremiumCoin" icon={Zap} accent="border-blue-700" />
        <StatCard label="Активних гравців" value={stats ? `${stats.activeUsers}/${stats.totalUsers}` : "—"}
          sub={stats ? `Заблоковано: ${stats.flaggedUsers}` : undefined} icon={Users} accent="border-amber-700" />
        <StatCard label="Відкриті алерти" value={stats ? String(stats.openAlerts) : "—"}
          sub={`День №${stats?.currentTick ?? 0}`} icon={AlertTriangle}
          accent={stats && stats.openAlerts > 0 ? "border-red-700" : "border-gray-700"} />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Підприємства</p>
          <p className="text-3xl font-bold text-white mt-1">{stats?.totalEnterprises ?? "—"}</p>
          <p className="text-xs text-gray-500 mt-1">Активних на ринку</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Контракти</p>
          <p className="text-3xl font-bold text-white mt-1">
            <span className="text-emerald-400">{stats?.contractsActive ?? "—"}</span>
            <span className="text-gray-600 text-xl"> / {stats?.contractsTotal ?? "—"}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">Активних / Всього</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">GC на гравця</p>
          <p className="text-3xl font-bold text-white mt-1">
            {stats && stats.activeUsers > 0 ? fmt(stats.totalGC / stats.activeUsers) : "—"}
          </p>
          <p className="text-xs text-gray-500 mt-1">Середнє</p>
        </div>
      </div>

      {/* Emission / Burn panel */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">Монетарна Операція</h3>
          <button onClick={loadStats} className="text-gray-500 hover:text-gray-300 transition-colors">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {(["EMIT", "BURN"] as const).map((op) => (
            <button key={op} onClick={() => setEmitOp(op)}
              className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-semibold transition-all ${
                emitOp === op
                  ? op === "EMIT"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-red-700 border-red-600 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
              }`}>
              {op === "EMIT" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {op === "EMIT" ? "Емісія (випуск)" : "Спалення (вилучення)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {(["GC", "PC"] as const).map((c) => (
            <button key={c} onClick={() => setCur(c)}
              className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                currency === c
                  ? c === "GC"
                    ? "bg-emerald-900 border-emerald-600 text-emerald-300"
                    : "bg-blue-900 border-blue-600 text-blue-300"
                  : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"
              }`}>
              {c === "GC" ? "GameCash (GC)" : "PremiumCoin (PC)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Сума на гравця</label>
            <input type="number" value={amount} onChange={(e) => setAmt(e.target.value)} min="1"
              placeholder="Наприклад: 5000"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Причина / коментар</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Антиінфляційна операція"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
          </div>
        </div>

        {amount && parseFloat(amount) > 0 && stats && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3 text-xs text-gray-400">
            Загальний вплив:
            <span className={`ml-1 font-semibold ${emitOp === "EMIT" ? "text-emerald-400" : "text-red-400"}`}>
              {emitOp === "EMIT" ? "+" : "−"}
              {fmt(parseFloat(amount) * stats.activeUsers)} {currency}
            </span>
            {" "}({stats.activeUsers} гравців × {fmt(parseFloat(amount))})
          </div>
        )}

        <button onClick={handleEmit} disabled={busy || !amount || !reason.trim()}
          className={`w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            emitOp === "EMIT"
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-red-700 hover:bg-red-600 text-white"
          }`}>
          {busy ? "Виконання..." : emitOp === "EMIT" ? "Провести Емісію" : "Провести Спалення"}
        </button>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-xl z-50 ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}
