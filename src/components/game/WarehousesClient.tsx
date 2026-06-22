"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Warehouse, Package, Building2, ChevronRight, Zap, Truck, Trash2,
  AlertTriangle, ArrowRightLeft, Search, TrendingUp,
} from "lucide-react";
import { QualityBar } from "@/components/game/QualityBar";
import { EnterpriseCategoryBadge } from "@/components/game/EnterpriseCategoryBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvItem {
  productId: string; productName: string; unit: string;
  quantity: number; reservedQty?: number; quality: number; avgCost: number;
  basePrice?: number; autoSellQty?: number; autoSellPrice?: number | null;
}

interface EntGroup {
  id: string; name: string; category: string; icon: string | null; cityName: string;
  items: InvItem[];
}

interface WareGroup {
  id: string; name: string; cityName: string; capacity: number; usedCapacity: number;
  items: InvItem[];
}

interface Summary {
  productId: string; productName: string; unit: string; basePrice: number;
  totalQty: number; totalValue: number;
}

interface WareData {
  enterprises: EntGroup[];
  warehouses:  Record<string, WareGroup>;
  summary:     Summary[];
}

interface SupplyRoute {
  id: string; sourceEnterpriseId: string; sourceName: string;
  targetEnterpriseId: string; targetName: string;
  productId: string; productName: string; unit: string;
  qtyPerTick: number; isActive: boolean;
}

interface TransferTarget {
  sourceEnterpriseId  : string;
  sourceEnterpriseName: string;
  productId           : string;
  productName         : string;
  unit                : string;
  freeQty             : number;
  enterprises         : { id: string; name: string }[];
}

// ─── View toggle ─────────────────────────────────────────────────────────────

type View = "summary" | "byEnterprise";

// ─── Summary table ────────────────────────────────────────────────────────────

type SortKey = "name" | "qty" | "value";

function SummaryTable({ rows }: { rows: Summary[] }) {
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) =>
      r.productName.toLowerCase().includes(search.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === "name") {
        const cmp = a.productName.localeCompare(b.productName, "uk");
        return sortDir === "asc" ? cmp : -cmp;
      }
      va = sortKey === "qty" ? a.totalQty : a.totalValue;
      vb = sortKey === "qty" ? b.totalQty : b.totalValue;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <span className="text-gray-700 text-xs">↕</span>
      : <span className="text-violet-400 text-xs">{sortDir === "desc" ? "↓" : "↑"}</span>;

  if (rows.length === 0) return (
    <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
      <Package size={28} className="text-gray-700 mx-auto mb-3" />
      <p className="text-gray-500 text-sm">Склади порожні — запустіть тік, щоб з'явилися товари</p>
    </div>
  );

  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Загальні запаси</CardTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              {rows.length} товарів · <span className="text-amber-400 font-mono">{formatNumber(totalValue)} ₴</span>
            </p>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук..."
              className="bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 w-40"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("name")}
              >
                Товар <SortIcon k="name" />
              </th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider font-medium">Одиниця</th>
              <th
                className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("qty")}
              >
                Кількість <SortIcon k="qty" />
              </th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-medium">Баз. ціна</th>
              <th
                className="px-4 py-3 text-right text-xs text-gray-500 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("value")}
              >
                Вартість <SortIcon k="value" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">Нічого не знайдено</td></tr>
            ) : sorted.map((r) => {
              const valuePct = totalValue > 0 ? (r.totalValue / totalValue) * 100 : 0;
              return (
                <tr key={r.productId} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{r.productName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.unit}</td>
                  <td className="px-4 py-3 font-mono text-white text-right">{r.totalQty.toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono text-gray-400 text-right">{r.basePrice} ₴</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-amber-400">{formatNumber(r.totalValue)} ₴</span>
                    <div className="mt-1 h-0.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500/50 rounded-full" style={{ width: `${valuePct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Supply route modal ───────────────────────────────────────────────────────

interface SupplyTarget {
  sourceEnterpriseId: string;
  productId         : string;
  productName       : string;
  unit              : string;
  enterprises       : { id: string; name: string }[];
  existingRoutes    : SupplyRoute[];
}

function SupplyRouteModal({
  target, onClose, onSaved,
}: {
  target  : SupplyTarget;
  onClose : () => void;
  onSaved : () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [qty,      setQty]      = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const availableTargets = target.enterprises.filter((e) => e.id !== target.sourceEnterpriseId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!targetId) { setError("Оберіть підприємство-ціль"); return; }
    const q = Number(qty);
    if (q <= 0) { setError("Кількість має бути > 0"); return; }
    setSaving(true);
    const res = await fetch("/api/supply-routes", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        sourceEnterpriseId: target.sourceEnterpriseId,
        targetEnterpriseId: targetId,
        productId         : target.productId,
        qtyPerTick        : q,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Помилка"); return; }
    onSaved();
    onClose();
  }

  async function deleteRoute(id: string) {
    await fetch(`/api/supply-routes/${id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <Dialog open title={`Постачання: ${target.productName}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Existing routes */}
        {target.existingRoutes.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Активні маршрути</p>
            <div className="space-y-2">
              {target.existingRoutes.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-300">
                    → <span className="text-white font-medium">{r.targetName}</span>
                    <span className="text-gray-500 ml-2">{formatNumber(r.qtyPerTick)} {r.unit}/тік</span>
                  </span>
                  <button
                    onClick={() => deleteRoute(r.id)}
                    className="text-red-500 hover:text-red-400 p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New route form */}
        <form onSubmit={handleSave} className="space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Новий маршрут</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Підприємство-ціль *</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="">Оберіть...</option>
                {availableTargets.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <Input
              label={`Кількість / тік (${target.unit}) *`}
              type="number"
              placeholder="0"
              min={0.01}
              step={0.01}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          {error && (
            <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Скасувати</Button>
            <Button type="submit" loading={saving} className="flex-1">
              <Truck size={14} /> Додати маршрут
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

// ─── Transfer modal ────────────────────────────────────────────────────────────

function TransferModal({
  target, onClose, onSaved,
}: {
  target  : TransferTarget;
  onClose : () => void;
  onSaved : () => void;
}) {
  const [dstId,  setDstId]  = useState("");
  const [qty,    setQty]    = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const available = target.enterprises.filter((e) => e.id !== target.sourceEnterpriseId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!dstId) { setError("Оберіть ціль"); return; }
    const q = Number(qty);
    if (q <= 0) { setError("Кількість > 0"); return; }
    if (q > target.freeQty) { setError(`Максимум вільних: ${target.freeQty.toFixed(2)}`); return; }
    setSaving(true);
    const res = await fetch("/api/warehouses/transfer", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        sourceEnterpriseId: target.sourceEnterpriseId,
        targetEnterpriseId: dstId,
        productId         : target.productId,
        quantity          : q,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Помилка"); return; }
    onSaved();
    onClose();
  }

  return (
    <Dialog open title={`Переміщення: ${target.productName}`} onClose={onClose} size="sm">
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-sm text-gray-400">
          З <span className="text-white font-medium">{target.sourceEnterpriseName}</span> →{" "}
          <span className="text-gray-500">оберіть ціль</span>
        </p>
        <p className="text-xs text-gray-500">
          Доступно для переміщення:{" "}
          <span className="font-mono text-white">{target.freeQty.toFixed(2)} {target.unit}</span>
        </p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Підприємство-ціль *</label>
          <select
            value={dstId}
            onChange={(e) => setDstId(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-600"
          >
            <option value="">Оберіть...</option>
            {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <Input
          label={`Кількість (${target.unit}) *`}
          type="number"
          placeholder="0"
          min={0.01}
          step={0.01}
          max={target.freeQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        {error && <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Скасувати</Button>
          <Button type="submit" loading={saving} className="flex-1">
            <ArrowRightLeft size={14} /> Перемістити
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Stock alerts panel ────────────────────────────────────────────────────────

interface StockAlert {
  type       : "low_free" | "accumulating" | "mostly_reserved";
  productName: string;
  entName    : string;
  qty        : number;
  freeQty    : number;
  reservedQty: number;
  unit       : string;
}

function StockAlertsPanel({ enterprises }: { enterprises: EntGroup[] }) {
  const alerts: StockAlert[] = [];

  for (const ent of enterprises) {
    for (const item of ent.items) {
      const reserved = item.reservedQty ?? 0;
      const free     = item.quantity - reserved;
      const reservedPct = item.quantity > 0 ? reserved / item.quantity : 0;

      if (item.quantity > 100 && free < 5) {
        alerts.push({ type: "low_free", productName: item.productName, entName: ent.name, qty: item.quantity, freeQty: free, reservedQty: reserved, unit: item.unit });
      } else if (reservedPct > 0.9 && item.quantity > 10) {
        alerts.push({ type: "mostly_reserved", productName: item.productName, entName: ent.name, qty: item.quantity, freeQty: free, reservedQty: reserved, unit: item.unit });
      } else if (item.quantity > 500 && (item.autoSellQty ?? 0) === 0) {
        alerts.push({ type: "accumulating", productName: item.productName, entName: ent.name, qty: item.quantity, freeQty: free, reservedQty: reserved, unit: item.unit });
      }
    }
  }

  if (alerts.length === 0) return null;

  const ALERT_CFG = {
    low_free        : { label: "Майже немає вільних",  cls: "border-red-900/50 bg-red-950/20 text-red-400",    icon: AlertTriangle },
    mostly_reserved : { label: "Переважно зарезерв.", cls: "border-amber-900/50 bg-amber-950/20 text-amber-400", icon: AlertTriangle },
    accumulating    : { label: "Накопичується",       cls: "border-blue-900/50 bg-blue-950/20 text-blue-400",   icon: TrendingUp    },
  } as const;

  return (
    <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-400" />
        <h3 className="text-sm font-semibold text-white">{alerts.length} попередження про запаси</h3>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {alerts.slice(0, 9).map((a, i) => {
          const cfg  = ALERT_CFG[a.type];
          const Icon = cfg.icon;
          return (
            <div key={i} className={cn("rounded-lg border px-3 py-2 space-y-0.5", cfg.cls)}>
              <div className="flex items-center gap-1.5">
                <Icon size={11} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">{cfg.label}</span>
              </div>
              <p className="text-white text-xs font-medium truncate">{a.productName}</p>
              <p className="text-gray-500 text-[10px] truncate">{a.entName}</p>
              <p className="text-[10px]">
                <span className="font-mono">{a.qty.toFixed(1)}</span> {a.unit}
                {" · "}вільно: <span className="font-mono">{a.freeQty.toFixed(1)}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Auto-sell modal ─────────────────────────────────────────────────────────

interface AutoSellTarget {
  enterpriseId : string;
  productId    : string;
  productName  : string;
  unit         : string;
  basePrice    : number;
  autoSellQty  : number;
  autoSellPrice: number | null;
}

function AutoSellModal({
  target, onClose, onSaved,
}: {
  target   : AutoSellTarget;
  onClose  : () => void;
  onSaved  : (qty: number, price: number | null) => void;
}) {
  const [qty,   setQty]   = useState(target.autoSellQty > 0 ? String(target.autoSellQty) : "");
  const [price, setPrice] = useState(target.autoSellPrice != null ? String(target.autoSellPrice) : String(target.basePrice));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const sellQty   = Number(qty);
    const sellPrice = Number(price);
    if (sellQty < 0) { setError("Кількість не може бути від'ємною"); return; }
    if (sellPrice <= 0) { setError("Ціна має бути > 0"); return; }
    setSaving(true);
    const res = await fetch(`/api/enterprises/${target.enterpriseId}/autosell`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        productId    : target.productId,
        autoSellQty  : sellQty,
        autoSellPrice: sellQty > 0 ? sellPrice : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Помилка"); return; }
    onSaved(data.autoSellQty, data.autoSellPrice);
    onClose();
  }

  return (
    <Dialog open title={`Автопродаж: ${target.productName}`} onClose={onClose} size="sm">
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-sm text-gray-400">
          Кожен ігровий тік автоматично продаватиме вказану кількість товару за фіксованою ціною.
        </p>
        <Input
          label={`Кількість / тік (${target.unit})`}
          type="number"
          placeholder="0 — вимкнено"
          min={0}
          step={0.01}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Input
          label="Ціна за одиницю (GC)"
          type="number"
          placeholder={String(target.basePrice)}
          min={0.01}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <p className="text-xs text-gray-600">Базова ціна: {target.basePrice} ₴ / {target.unit}</p>
        {error && (
          <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Скасувати</Button>
          <Button type="submit" loading={saving} className="flex-1">Зберегти</Button>
        </div>
        {target.autoSellQty > 0 && (
          <button
            type="button"
            className="w-full text-xs text-red-500 hover:text-red-400 mt-1"
            onClick={async () => {
              setSaving(true);
              await fetch(`/api/enterprises/${target.enterpriseId}/autosell`, {
                method : "PATCH",
                headers: { "Content-Type": "application/json" },
                body   : JSON.stringify({ productId: target.productId, autoSellQty: 0, autoSellPrice: null }),
              });
              setSaving(false);
              onSaved(0, null);
              onClose();
            }}
          >
            Вимкнути автопродаж
          </button>
        )}
      </form>
    </Dialog>
  );
}

// ─── Enterprise inventory ─────────────────────────────────────────────────────

function EnterpriseInventoryCard({
  ent, enterprises, supplyRoutes, onRefresh,
}: {
  ent: EntGroup;
  enterprises: { id: string; name: string }[];
  supplyRoutes: SupplyRoute[];
  onRefresh: () => void;
}) {
  const [autoSellTarget,  setAutoSellTarget]  = useState<AutoSellTarget | null>(null);
  const [supplyTarget,    setSupplyTarget]    = useState<SupplyTarget | null>(null);
  const [transferTarget,  setTransferTarget]  = useState<TransferTarget | null>(null);
  const totalValue = ent.items.reduce((s, i) => s + i.quantity * (i.avgCost || i.basePrice || 0), 0);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{ent.icon ?? "🏭"}</span>
                <h3 className="font-semibold text-white truncate">{ent.name}</h3>
                <EnterpriseCategoryBadge category={ent.category as "EXTRACTION" | "PRODUCTION" | "TRADE" | "LOGISTICS"} />
              </div>
              <p className="text-xs text-gray-500">{ent.cityName}</p>
            </div>
            <Link
              href={`/enterprises/${ent.id}`}
              className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 shrink-0"
            >
              Відкрити <ChevronRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          {ent.items.length === 0 ? (
            <p className="text-xs text-gray-600 px-5 py-3">Склад порожній</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="border-y border-gray-800">
                  <tr>
                    {["Товар", "Кількість", "Резерв", "Якість", "Собівартість", "Автопродаж", "Постачати", "Перемістити"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-gray-600 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {ent.items.map((inv) => {
                    const hasAuto = (inv.autoSellQty ?? 0) > 0;
                    return (
                      <tr key={inv.productId} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="text-white text-sm font-medium">{inv.productName}</p>
                          <p className="text-xs text-gray-600">{inv.unit}</p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-white">{inv.quantity.toFixed(1)}</td>
                        <td className="px-4 py-2.5 font-mono text-amber-400 text-sm">
                          {(inv.reservedQty ?? 0) > 0
                            ? (inv.reservedQty ?? 0).toFixed(1)
                            : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5"><QualityBar value={inv.quality} size="sm" showLabel /></td>
                        <td className="px-4 py-2.5 font-mono text-gray-400 text-sm">
                          {inv.avgCost > 0 ? `${inv.avgCost.toFixed(2)} ₴` : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          {hasAuto ? (
                            <span className="text-emerald-400 font-mono text-xs">
                              {formatNumber(inv.autoSellQty!)} / тік
                              {inv.autoSellPrice != null && (
                                <span className="text-gray-500"> @ {inv.autoSellPrice} ₴</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-700 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {(() => {
                            const routesForItem = supplyRoutes.filter(
                              (r) => r.sourceEnterpriseId === ent.id && r.productId === inv.productId
                            );
                            const hasRoute = routesForItem.length > 0;
                            return (
                              <button
                                title="Налаштувати постачання"
                                onClick={() => setSupplyTarget({
                                  sourceEnterpriseId: ent.id,
                                  productId         : inv.productId,
                                  productName       : inv.productName,
                                  unit              : inv.unit,
                                  enterprises,
                                  existingRoutes    : routesForItem,
                                })}
                                className={cn(
                                  "flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors",
                                  hasRoute
                                    ? "border-blue-700 text-blue-400 hover:bg-blue-900/30"
                                    : "border-gray-700 text-gray-500 hover:text-white hover:border-gray-500",
                                )}
                              >
                                <Truck size={11} />
                                {hasRoute ? `${routesForItem.length} маршр.` : "Авто"}
                              </button>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            title="Налаштувати автопродаж"
                            onClick={() => setAutoSellTarget({
                              enterpriseId : ent.id,
                              productId    : inv.productId,
                              productName  : inv.productName,
                              unit         : inv.unit,
                              basePrice    : inv.basePrice ?? 1,
                              autoSellQty  : inv.autoSellQty ?? 0,
                              autoSellPrice: inv.autoSellPrice ?? null,
                            })}
                            className={cn(
                              "flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors",
                              hasAuto
                                ? "border-emerald-700 text-emerald-400 hover:bg-emerald-900/30"
                                : "border-gray-700 text-gray-500 hover:text-white hover:border-gray-500",
                            )}
                          >
                            <Zap size={11} /> Авто
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          {enterprises.filter((e) => e.id !== ent.id).length > 0 && (
                            <button
                              title="Перемістити на інше підприємство"
                              onClick={() => setTransferTarget({
                                sourceEnterpriseId  : ent.id,
                                sourceEnterpriseName: ent.name,
                                productId           : inv.productId,
                                productName         : inv.productName,
                                unit                : inv.unit,
                                freeQty             : Math.max(0, inv.quantity - (inv.reservedQty ?? 0)),
                                enterprises,
                              })}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-700 text-gray-500 hover:text-violet-400 hover:border-violet-700 transition-colors"
                            >
                              <ArrowRightLeft size={11} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-gray-800 text-right">
                <span className="text-xs text-gray-500">
                  Вартість запасів: <span className="text-amber-400 font-mono">{formatNumber(totalValue)} ₴</span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {autoSellTarget && (
        <AutoSellModal
          target={autoSellTarget}
          onClose={() => setAutoSellTarget(null)}
          onSaved={(qty, price) => {
            const item = ent.items.find((i) => i.productId === autoSellTarget.productId);
            if (item) { item.autoSellQty = qty; item.autoSellPrice = price; }
            setAutoSellTarget(null);
            onRefresh();
          }}
        />
      )}
      {supplyTarget && (
        <SupplyRouteModal
          target={supplyTarget}
          onClose={() => setSupplyTarget(null)}
          onSaved={() => { setSupplyTarget(null); onRefresh(); }}
        />
      )}
      {transferTarget && (
        <TransferModal
          target={transferTarget}
          onClose={() => setTransferTarget(null)}
          onSaved={() => { setTransferTarget(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WarehousesClient() {
  const [data,         setData]         = useState<WareData | null>(null);
  const [allEnts,      setAllEnts]      = useState<{ id: string; name: string }[]>([]);
  const [supplyRoutes, setSupplyRoutes] = useState<SupplyRoute[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState<View>("summary");

  function load() {
    Promise.all([
      fetch("/api/warehouses").then((r) => r.json()),
      fetch("/api/supply-routes").then((r) => r.json()),
      fetch("/api/enterprises").then((r) => r.json()),
    ]).then(([ware, sr, ents]) => {
      setData(ware);
      setSupplyRoutes(sr.routes ?? []);
      setAllEnts((ents.enterprises ?? []).map((e: any) => ({ id: e.id, name: e.name })));
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const wareList = data ? Object.values(data.warehouses) : [];
  const totalEntItems = data?.enterprises.reduce((s, e) => s + e.items.length, 0) ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Warehouse size={22} className="text-violet-400" /> Склади
          </h1>
          <p className="text-gray-500 text-sm mt-1">Запаси на всіх підприємствах і складах компанії</p>
        </div>

        {/* View toggle */}
        {!loading && data && (
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {(["summary", "byEnterprise"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  view === v ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:text-white",
                )}
              >
                {v === "summary" ? "Зведення" : "По підприємствах"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top stat cards */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Товарів (видів)</p>
            <p className="text-2xl font-bold text-white">{data.summary.length}</p>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 px-4 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Вартість запасів</p>
            <p className="text-lg font-bold text-amber-400 font-mono">{formatNumber(data.summary.reduce((s, r) => s + r.totalValue, 0))}</p>
            <p className="text-[10px] text-gray-600">GC</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Підприємств</p>
            <p className="text-2xl font-bold text-white">{data.enterprises.length}</p>
          </div>
          <div className="rounded-xl border border-violet-900/30 bg-violet-950/10 px-4 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Найдорожчий товар</p>
            <p className="text-sm font-semibold text-white truncate">{data.summary[0]?.productName ?? "—"}</p>
            <p className="text-[10px] text-amber-400 font-mono">{formatNumber(data.summary[0]?.totalValue ?? 0)} ₴</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {!loading && data && <StockAlertsPanel enterprises={data.enterprises} />}

      {/* Standalone warehouses banner */}
      {!loading && wareList.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wareList.map((w) => {
            const pct = w.capacity > 0 ? (w.usedCapacity / w.capacity) * 100 : 0;
            return (
              <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Warehouse size={15} className="text-violet-400" />
                  <span className="font-medium text-white text-sm">{w.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">{w.cityName}</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-1">
                  <div
                    className={cn("h-full rounded-full", pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-violet-500")}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {w.usedCapacity} / {w.capacity} одиниць ({pct.toFixed(0)}%)
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !data || (data.enterprises.length === 0 && wareList.length === 0) ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-16 text-center">
          <Building2 size={32} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Підприємств ще немає</p>
          <Link href="/enterprises/create" className="text-emerald-500 text-sm mt-2 inline-block hover:text-emerald-400">
            Відкрити перше підприємство →
          </Link>
        </div>
      ) : view === "summary" ? (
        <SummaryTable rows={data.summary} />
      ) : (
        <div className="space-y-4">
          {totalEntItems === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 p-12 text-center">
              <Package size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">На підприємствах нема товарів</p>
              <p className="text-gray-600 text-xs mt-1">Запустіть ігровий тік, щоб розпочати виробництво</p>
            </div>
          ) : (
            data.enterprises.map((ent) => (
              <EnterpriseInventoryCard
                key={ent.id}
                ent={ent}
                enterprises={allEnts}
                supplyRoutes={supplyRoutes}
                onRefresh={load}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
