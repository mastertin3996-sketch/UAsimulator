"use client";

import {
  RadialBarChart, RadialBar, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#a78bfa", "#ef4444"];

interface SaleEntry { name: string; revenue: number; quantity: number }

export function TopSalesChart({ data }: { data: SaleEntry[] }) {
  if (!data.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Топ магазинів за виручкою</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-44 text-gray-600 text-sm">
            Продажі з'являться після першого дня
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <Card>
      <CardHeader><CardTitle>Топ магазинів за виручкою</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={data}
                dataKey="revenue"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`${formatNumber(Number(v))} GC`, "Виручка"]}
                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#9ca3af" }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-2">
            {data.map((entry, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-xs text-gray-300 truncate">{entry.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono text-white">{formatNumber(entry.revenue)} GC</div>
                  <div className="text-[10px] text-gray-600">
                    {total > 0 ? ((entry.revenue / total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
