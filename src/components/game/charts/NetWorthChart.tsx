"use client";

import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

interface SnapshotPoint {
  tick: number; cashBalance: number; totalAssets: number;
  revenue: number; opex: number; netProfit: number;
}

const fmt = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000
    ? `${(v / 1_000).toFixed(0)}K`
    : v.toFixed(0);

function NWTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-gray-500 mb-1.5">День #{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-white">₴{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PnLTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-gray-500 mb-1.5">День #{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className={`font-mono ${p.value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {p.value >= 0 ? "+" : ""}₴{fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NetWorthChart({ data }: { data: SnapshotPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-36 text-gray-600 text-xs">
        Дані з'являться після першого snapshot (кожні 24 дні)
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="tick" tick={{ fill: "#374151", fontSize: 10 }} tickFormatter={(v) => `#${v}`} />
        <YAxis tick={{ fill: "#374151", fontSize: 10 }} tickFormatter={fmt} width={40} />
        <Tooltip content={<NWTooltip />} />
        <Area type="monotone" dataKey="totalAssets" name="Активи" stroke="#8b5cf6" fill="url(#gradAssets)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="cashBalance" name="Готівка" stroke="#f59e0b" fill="url(#gradCash)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PnLChart({ data }: { data: SnapshotPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-xs">
        Немає даних
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="tick" tick={{ fill: "#374151", fontSize: 10 }} tickFormatter={(v) => `#${v}`} />
        <YAxis tick={{ fill: "#374151", fontSize: 10 }} tickFormatter={fmt} width={40} />
        <Tooltip content={<PnLTooltip />} />
        <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="revenue"   name="Дохід"    stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="opex"      name="Витрати"  stroke="#ef4444" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="netProfit" name="Прибуток" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
