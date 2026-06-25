"use client";

import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  Bar,
} from "recharts";
import { formatNumber } from "@/lib/utils";

interface PricePoint {
  date:     string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  volume:   number;
  count:    number;
}

interface Props {
  data:      PricePoint[];
  refPrice?: number;
  height?:   number;
}

function fmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="text-gray-400 font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-white">₴{formatNumber(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProductPriceChart({ data, refPrice, height = 160 }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-600 text-xs" style={{ height }}>
        Недостатньо даних для графіку
      </div>
    );
  }

  // Prepare data: minMax as area range + avgPrice line + volume bars
  const chartData = data.map((d) => ({
    date:    d.date.slice(5), // MM-DD
    avg:     d.avgPrice,
    min:     d.minPrice,
    // recharts Area with two dataKeys trick: use [min, max] range
    range:   [d.minPrice, d.maxPrice] as [number, number],
    volume:  d.volume,
  }));

  const prices = data.flatMap((d) => [d.minPrice, d.maxPrice, d.avgPrice, refPrice ?? 0]).filter(Boolean);
  const yMin   = Math.max(0, Math.floor(Math.min(...prices) * 0.93));
  const yMax   = Math.ceil(Math.max(...prices) * 1.07);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="priceRange" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#4b5563", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fill: "#4b5563", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmt}
          width={42}
          yAxisId="price"
        />
        <YAxis
          yAxisId="vol"
          orientation="right"
          tick={false}
          axisLine={false}
          tickLine={false}
          width={0}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* Volume bars (secondary axis, shown faint at the bottom) */}
        <Bar
          yAxisId="vol"
          dataKey="volume"
          fill="#374151"
          opacity={0.4}
          radius={[1, 1, 0, 0]}
          name="Обсяг"
          maxBarSize={12}
        />

        {/* Min–Max range area */}
        <Area
          yAxisId="price"
          dataKey="range"
          stroke="none"
          fill="url(#priceRange)"
          name="Діапазон"
          legendType="none"
          activeDot={false}
        />

        {/* Avg price line */}
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="avg"
          stroke="#818cf8"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "#818cf8" }}
          name="Середня ціна"
        />

        {/* Reference price dashed line */}
        {refPrice && refPrice > 0 && (
          <ReferenceLine
            yAxisId="price"
            y={refPrice}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{ value: "NPC", position: "insideRight", fill: "#d97706", fontSize: 9 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
