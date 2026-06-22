"use client";

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TickData {
  tick: number;
  revenue: number;
  expenses: number;
  profit: number;
}

const fmt = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `${(v / 1_000).toFixed(1)}K`
    : v.toFixed(0);

/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="text-gray-400 mb-2 font-medium">Тік #{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-mono text-white">{fmt(p.value)} GC</span>
        </div>
      ))}
    </div>
  );
}

/* ── Revenue / Expenses AreaChart ── */
export function RevenueChart({ data, compact = false }: { data: TickData[]; compact?: boolean }) {
  if (!data.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Дохід / Витрати</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-52 text-gray-600 text-sm">
            Дані з'являться після першого ігрового тіку
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Дохід / Витрати (останні 30 тіків)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={compact ? 160 : 240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="tick"
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={(v) => `#${v}`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={fmt}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => <span style={{ color: "#9ca3af", fontSize: 12 }}>{v}</span>}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Дохід"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradRevenue)"
              dot={false}
              activeDot={{ r: 4, fill: "#10b981" }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Витрати"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#gradExpenses)"
              dot={false}
              activeDot={{ r: 4, fill: "#ef4444" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ── Profit BarChart ── */
export function ProfitChart({ data }: { data: TickData[] }) {
  if (!data.length) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Прибуток по тіках</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="tick"
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={(v) => `#${v}`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={fmt}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="profit"
              name="Прибуток"
              radius={[4, 4, 0, 0]}
              fill="#3b82f6"
              /* bar color depends on value sign */
              label={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
