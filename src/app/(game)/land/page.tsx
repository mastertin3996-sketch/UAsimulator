"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MapPin, Building2, Maximize2, Leaf, ShoppingCart, AlertCircle, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

interface LandPlot {
  id: string;
  cadastralNumber: string;
  totalAreaM2: number;
  purchasePriceUah: number;
  monthlyLeaseCostUah: number;
  status: string;
  city: { id: string; nameUa: string; region: string };
}

interface MyPlot extends LandPlot {
  usedAreaM2: number;
  freeAreaM2: number;
  purchasedAt: string | null;
  leaseStartDate: string | null;
  enterprises: { id: string; name: string; type: string }[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  OWNED:  { label: "Власна",   color: "text-emerald-400" },
  LEASED: { label: "Орендована", color: "text-amber-400" },
};

const ENT_TYPE_LABEL: Record<string, string> = {
  FARM: "Ферма", FACTORY: "Завод", RETAIL_STORE: "Магазин",
  WAREHOUSE: "Склад", MINE: "Шахта", BAKERY: "Пекарня",
};

export default function LandPage() {
  const [mine,      setMine]      = useState<MyPlot[]>([]);
  const [available, setAvailable] = useState<LandPlot[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [buying,    setBuying]    = useState<string | null>(null);
  const [err,       setErr]       = useState<string | null>(null);
  const [tab,       setTab]       = useState<"mine" | "market">("mine");
  const [cityFilter, setCityFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/land");
      const data = await res.json();
      setMine(data.mine ?? []);
      setAvailable(data.available ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acquire(plotId: string, action: "buy" | "lease") {
    setBuying(plotId);
    setErr(null);
    try {
      const res = await fetch("/api/land", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plotId, action }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Помилка"); return; }
      window.dispatchEvent(new CustomEvent("game:balance"));
      await load();
    } finally {
      setBuying(null);
    }
  }

  const cities = Array.from(new Set(available.map((p) => p.city.nameUa))).sort();
  const filteredAvail = cityFilter
    ? available.filter((p) => p.city.nameUa === cityFilter)
    : available;

  const totalOwned  = mine.filter((p) => p.status === "OWNED").length;
  const totalLeased = mine.filter((p) => p.status === "LEASED").length;
  const monthlyRent = mine
    .filter((p) => p.status === "LEASED")
    .reduce((s, p) => s + p.monthlyLeaseCostUah, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Земельні ділянки</h1>
          <p className="text-sm text-gray-500 mt-0.5">Перегляд власних та доступних ділянок</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Оновити
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Власних ділянок",  value: totalOwned,  color: "text-emerald-400", icon: Leaf },
          { label: "Орендованих",      value: totalLeased, color: "text-amber-400",   icon: MapPin },
          { label: "Оренда/місяць",    value: `₴${formatNumber(Math.round(monthlyRent))}`, color: "text-red-400", icon: ShoppingCart },
        ].map(({ label, value, color, icon: Icon }) => (
          <Card key={label} className="bg-gray-900 border-gray-800">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="p-2 rounded-lg bg-gray-800">
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className={cn("text-lg font-bold", color)}>{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {(["mine", "market"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-300",
            )}
          >
            {t === "mine" ? `Мої ділянки (${mine.length})` : `Ринок (${available.length})`}
          </button>
        ))}
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-600 text-sm">Завантаження…</div>
      ) : tab === "mine" ? (
        mine.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 py-16 text-center">
            <MapPin size={32} className="mx-auto mb-3 text-gray-700" />
            <p className="text-gray-500 text-sm">У вас ще немає ділянок</p>
            <button onClick={() => setTab("market")} className="mt-3 text-xs text-emerald-500 hover:text-emerald-400">
              Переглянути ринок →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mine.map((p) => {
              const usedPct = p.totalAreaM2 > 0 ? (p.usedAreaM2 / p.totalAreaM2) * 100 : 0;
              const cfg = STATUS_LABEL[p.status] ?? { label: p.status, color: "text-gray-400" };
              return (
                <Card key={p.id} className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{p.city.nameUa}</CardTitle>
                        <p className="text-xs text-gray-500 mt-0.5">{p.city.region} • {p.cadastralNumber}</p>
                      </div>
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-800", cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Area bar */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="flex items-center gap-1"><Maximize2 size={11} /> Площа</span>
                        <span>{formatNumber(p.usedAreaM2)} / {formatNumber(p.totalAreaM2)} м²</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-800">
                        <div
                          className={cn("h-full rounded-full transition-all", usedPct > 90 ? "bg-red-500" : usedPct > 60 ? "bg-amber-500" : "bg-emerald-500")}
                          style={{ width: `${Math.min(100, usedPct)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">Вільно: {formatNumber(p.freeAreaM2)} м²</p>
                    </div>

                    {/* Cost */}
                    {p.status === "LEASED" && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Оренда/місяць</span>
                        <span className="text-amber-400 font-mono font-semibold">₴{formatNumber(Math.round(p.monthlyLeaseCostUah))}</span>
                      </div>
                    )}
                    {p.status === "OWNED" && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Вартість</span>
                        <span className="text-emerald-400 font-mono font-semibold">₴{formatNumber(Math.round(p.purchasePriceUah))}</span>
                      </div>
                    )}

                    {/* Enterprises */}
                    {p.enterprises.length > 0 ? (
                      <div>
                        <p className="text-xs text-gray-500 mb-1.5">Підприємства:</p>
                        <div className="space-y-1">
                          {p.enterprises.map((e) => (
                            <Link
                              key={e.id}
                              href={`/enterprises/${e.id}`}
                              className="flex items-center gap-2 rounded-lg bg-gray-800 px-2.5 py-1.5 hover:bg-gray-700 transition-colors"
                            >
                              <Building2 size={12} className="text-blue-400 shrink-0" />
                              <span className="text-xs text-gray-200">{e.name}</span>
                              <span className="ml-auto text-xs text-gray-500">{ENT_TYPE_LABEL[e.type] ?? e.type}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-700 px-3 py-2 text-center">
                        <p className="text-xs text-gray-600">Підприємств немає</p>
                        <Link href={`/enterprises/create?plotId=${p.id}&action=${p.status === "OWNED" ? "buy" : "lease"}`} className="text-xs text-emerald-500 hover:text-emerald-400">
                          Побудувати →
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* Market tab */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Всі міста</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-gray-500">{filteredAvail.length} ділянок</span>
          </div>

          {filteredAvail.length === 0 ? (
            <div className="py-12 text-center text-gray-600 text-sm">Доступних ділянок немає</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAvail.map((p) => (
                <Card key={p.id} className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{p.city.nameUa}</CardTitle>
                        <p className="text-xs text-gray-500 mt-0.5">{p.city.region} • {p.cadastralNumber}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400">
                        Доступна
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-1.5 text-sm text-gray-300">
                      <Maximize2 size={13} className="text-gray-500" />
                      {formatNumber(p.totalAreaM2)} м²
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-gray-800 px-3 py-2">
                        <p className="text-gray-500 mb-0.5">Купити</p>
                        <p className="text-emerald-400 font-mono font-semibold">₴{formatNumber(Math.round(p.purchasePriceUah))}</p>
                      </div>
                      <div className="rounded-lg bg-gray-800 px-3 py-2">
                        <p className="text-gray-500 mb-0.5">Орендувати/міс</p>
                        <p className="text-amber-400 font-mono font-semibold">₴{formatNumber(Math.round(p.monthlyLeaseCostUah))}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => acquire(p.id, "lease")}
                        disabled={buying === p.id}
                        className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-950/50 disabled:opacity-50 transition-colors"
                      >
                        {buying === p.id ? "…" : "Орендувати"}
                      </button>
                      <button
                        onClick={() => acquire(p.id, "buy")}
                        disabled={buying === p.id}
                        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                      >
                        {buying === p.id ? "…" : "Купити"}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
