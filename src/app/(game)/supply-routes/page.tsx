"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Truck, Plus, Trash2, Pencil, Check, X,
  ArrowRight, Building2, ToggleLeft, ToggleRight,
  Loader2, AlertCircle, Search, LayoutList, GitFork,
  Package, ZapOff, Zap, AlertTriangle, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Route {
  id                : string;
  sourceEnterpriseId: string;
  sourceName        : string;
  targetEnterpriseId: string;
  targetName        : string;
  productId         : string;
  productName       : string;
  unit              : string;
  qtyPerTick        : number;
  isActive          : boolean;
  sourceQty         : number;
  targetQty         : number;
}

interface EntOption { id: string; name: string }

interface InvProduct {
  productId  : string;
  productName: string;
  unit       : string;
  quantity   : number;
}

interface EntWithInv {
  id   : string;
  name : string;
  items: InvProduct[];
}

// ─── Stock level helper ───────────────────────────────────────────────────────

function stockLevel(sourceQty: number, qtyPerTick: number): "ok" | "low" | "empty" {
  if (sourceQty <= 0)              return "empty";
  if (sourceQty < qtyPerTick * 3) return "low";
  return "ok";
}

const STOCK_CFG = {
  ok   : { dot: "bg-emerald-500", text: "text-emerald-400", label: "Запас ок"     },
  low  : { dot: "bg-amber-500",   text: "text-amber-400",   label: "Мало запасу"  },
  empty: { dot: "bg-red-500",     text: "text-red-400",     label: "Запас вичерп" },
};

function groupBySource(routes: Route[]) {
  const map = new Map<string, { sourceName: string; routes: Route[] }>();
  for (const r of routes) {
    if (!map.has(r.sourceEnterpriseId)) {
      map.set(r.sourceEnterpriseId, { sourceName: r.sourceName, routes: [] });
    }
    map.get(r.sourceEnterpriseId)!.routes.push(r);
  }
  return map;
}

// ─── Qty Editor ───────────────────────────────────────────────────────────────

function QtyEditor({ route, onSaved }: { route: Route; onSaved: (qty: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(String(route.qtyPerTick));
  const [saving,  setSaving]  = useState(false);

  async function save() {
    const q = Number(val);
    if (q <= 0 || isNaN(q)) return;
    setSaving(true);
    const res = await fetch(`/api/supply-routes/${route.id}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ qtyPerTick: q }),
    });
    setSaving(false);
    if (res.ok) { onSaved(q); setEditing(false); }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(String(route.qtyPerTick)); setEditing(true); }}
        className="group flex items-center gap-1.5 text-xs font-mono text-white hover:text-emerald-400 transition-colors"
      >
        {formatNumber(route.qtyPerTick)} {route.unit}/тік
        <Pencil size={10} className="text-gray-600 group-hover:text-emerald-400 transition-colors" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
        autoFocus
      />
      <span className="text-xs text-gray-500">{route.unit}/тік</span>
      {saving
        ? <Loader2 size={12} className="animate-spin text-emerald-400" />
        : <>
            <button onClick={save}                  className="text-emerald-400 hover:text-emerald-300"><Check size={12} /></button>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white"><X size={12} /></button>
          </>
      }
    </div>
  );
}

// ─── Route Row ────────────────────────────────────────────────────────────────

function RouteRow({
  route,
  onToggle,
  onDelete,
  onQtyChange,
}: {
  route      : Route;
  onToggle   : () => void;
  onDelete   : () => void;
  onQtyChange: (qty: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const lvl = stockLevel(route.sourceQty, route.qtyPerTick);
  const cfg = STOCK_CFG[lvl];

  async function handleToggle() {
    setToggling(true);
    const res = await fetch(`/api/supply-routes/${route.id}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ isActive: !route.isActive }),
    });
    setToggling(false);
    if (res.ok) onToggle();
  }

  async function handleDelete() {
    if (!confirm(`Видалити маршрут ${route.sourceName} → ${route.productName} → ${route.targetName}?`)) return;
    setDeleting(true);
    await fetch(`/api/supply-routes/${route.id}`, { method: "DELETE" });
    onDelete();
  }

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0 transition-colors",
      route.isActive ? "hover:bg-gray-800/30" : "opacity-50 hover:bg-gray-800/20",
    )}>
      {/* Stock dot */}
      <div className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", route.isActive ? cfg.dot : "bg-gray-700")} title={cfg.label} />

      {/* Flow */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 w-32 shrink-0">
          <Building2 size={11} className="text-blue-400 shrink-0" />
          <span className="text-xs text-gray-300 truncate">{route.targetName}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <ArrowRight size={11} className="text-gray-600 shrink-0" />
          <Package size={11} className="text-gray-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{route.productName}</p>
            <QtyEditor route={route} onSaved={onQtyChange} />
          </div>
        </div>
      </div>

      {/* Stock info */}
      {route.isActive && (
        <div className="hidden sm:flex items-center gap-1 text-[10px] shrink-0">
          <span className={cfg.text}>
            {route.sourceQty > 0
              ? `${formatNumber(Math.round(route.sourceQty))} ${route.unit}`
              : "порожньо"
            }
          </span>
          {lvl !== "ok" && <AlertTriangle size={9} className={cfg.text} />}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded hidden xs:block",
          route.isActive ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-500",
        )}>
          {route.isActive ? "Активний" : "Зупинено"}
        </span>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={cn(
            "transition-colors",
            route.isActive ? "text-emerald-400 hover:text-emerald-300" : "text-gray-600 hover:text-gray-400",
          )}
          title={route.isActive ? "Зупинити" : "Активувати"}
        >
          {toggling ? <Loader2 size={16} className="animate-spin" /> : route.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-gray-600 hover:text-red-400 transition-colors"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Flow Graph ───────────────────────────────────────────────────────────────

function FlowGraph({ routes }: { routes: Route[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Build unique enterprises as source & target nodes
  const sources = [...new Map(routes.map((r) => [r.sourceEnterpriseId, r.sourceName])).entries()];
  const targets = [...new Map(routes.map((r) => [r.targetEnterpriseId, r.targetName])).entries()];

  // Product color palette
  const productIds = [...new Set(routes.map((r) => r.productId))];
  const COLORS = [
    "border-blue-700/60 text-blue-400",
    "border-emerald-700/60 text-emerald-400",
    "border-amber-700/60 text-amber-400",
    "border-purple-700/60 text-purple-400",
    "border-red-700/60 text-red-400",
    "border-pink-700/60 text-pink-400",
    "border-cyan-700/60 text-cyan-400",
    "border-orange-700/60 text-orange-400",
  ];
  const productColor = new Map(productIds.map((id, i) => [id, COLORS[i % COLORS.length]]));

  if (routes.length === 0) return null;

  return (
    <div className="space-y-4">
      {sources.map(([srcId, srcName]) => {
        const srcRoutes  = routes.filter((r) => r.sourceEnterpriseId === srcId);
        const isCollapsed = collapsed.has(srcId);

        return (
          <div key={srcId} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            {/* Source node header */}
            <button
              className="w-full flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
              onClick={() => setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(srcId)) next.delete(srcId); else next.add(srcId);
                return next;
              })}
            >
              <Building2 size={13} className="text-emerald-400 shrink-0" />
              <span className="text-sm font-semibold text-white">{srcName}</span>
              <span className="text-xs text-gray-600 ml-1">({srcRoutes.length} маршрутів)</span>
              <span className="ml-auto text-gray-600">
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            {!isCollapsed && (
              <div className="p-4 space-y-3">
                {srcRoutes.map((r) => {
                  const lvl = stockLevel(r.sourceQty, r.qtyPerTick);
                  const cfg = STOCK_CFG[lvl];
                  const color = productColor.get(r.productId) ?? COLORS[0];

                  return (
                    <div key={r.id} className={cn(
                      "flex items-center gap-3",
                      !r.isActive && "opacity-40",
                    )}>
                      {/* Arrow line */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Product badge */}
                        <span className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
                          color,
                        )}>
                          {r.productName}
                        </span>

                        {/* Dashed line */}
                        <div className={cn(
                          "flex-1 h-px border-t border-dashed min-w-4",
                          r.isActive ? "border-gray-600" : "border-gray-800",
                        )} />

                        {/* Qty badge */}
                        <span className="text-[10px] font-mono text-gray-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">
                          {formatNumber(r.qtyPerTick)}/тік
                        </span>

                        {/* Arrow */}
                        <ArrowRight size={11} className="text-gray-600 shrink-0" />

                        {/* Target node */}
                        <div className="flex items-center gap-1 bg-gray-800/80 border border-gray-700/50 rounded-lg px-2 py-1 shrink-0 max-w-[130px]">
                          <Building2 size={10} className="text-blue-400 shrink-0" />
                          <span className="text-[10px] text-gray-300 truncate">{r.targetName}</span>
                        </div>
                      </div>

                      {/* Stock indicator */}
                      {r.isActive && (
                        <div className={cn("flex items-center gap-1 text-[9px] shrink-0", cfg.text)}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                          {r.sourceQty > 0
                            ? `${formatNumber(Math.round(r.sourceQty))}`
                            : "0"
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-600 px-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" />Запас ок</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" />Мало (&lt;3 тіки)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" />Порожньо</span>
        <span className="ml-auto">Цифра = вільний запас на джерелі</span>
      </div>
    </div>
  );
}

// ─── Product Summary ──────────────────────────────────────────────────────────

function ProductSummary({ routes }: { routes: Route[] }) {
  const map = new Map<string, { name: string; unit: string; activeQty: number; pausedQty: number; count: number }>();
  for (const r of routes) {
    if (!map.has(r.productId)) map.set(r.productId, { name: r.productName, unit: r.unit, activeQty: 0, pausedQty: 0, count: 0 });
    const p = map.get(r.productId)!;
    p.count++;
    if (r.isActive) p.activeQty += r.qtyPerTick;
    else            p.pausedQty += r.qtyPerTick;
  }

  const items = Array.from(map.values()).sort((a, b) => b.activeQty - a.activeQty);
  const maxQty = Math.max(...items.map((i) => i.activeQty + i.pausedQty), 1);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider">Потік по товарах / тік</p>
      {items.map((p) => (
        <div key={p.name}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-300">{p.name}</span>
            <span className="text-gray-500 font-mono">
              {formatNumber(Math.round(p.activeQty))} {p.unit}
              {p.pausedQty > 0 && <span className="text-gray-700 ml-1">(+{formatNumber(Math.round(p.pausedQty))} пауза)</span>}
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
            {p.activeQty > 0 && (
              <div className="h-full bg-emerald-600/70 rounded-full" style={{ width: `${(p.activeQty / maxQty) * 100}%` }} />
            )}
            {p.pausedQty > 0 && (
              <div className="h-full bg-gray-700 rounded-full ml-0.5" style={{ width: `${(p.pausedQty / maxQty) * 100}%` }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Create Route Modal ───────────────────────────────────────────────────────

function CreateRouteModal({
  enterprises,
  entWithInv,
  onClose,
  onCreated,
}: {
  enterprises: EntOption[];
  entWithInv : EntWithInv[];
  onClose    : () => void;
  onCreated  : () => void;
}) {
  const [srcId,  setSrcId]  = useState("");
  const [prodId, setProdId] = useState("");
  const [tgtId,  setTgtId]  = useState("");
  const [qty,    setQty]    = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const srcInventory = entWithInv.find((e) => e.id === srcId)?.items ?? [];
  const tgtOptions   = enterprises.filter((e) => e.id !== srcId);

  function handleSrcChange(id: string) {
    setSrcId(id);
    setProdId("");
    setTgtId("");
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    const q = Number(qty);
    if (!srcId || !prodId || !tgtId) { setError("Заповніть всі поля"); return; }
    if (q <= 0) { setError("Кількість має бути > 0"); return; }
    setSaving(true);
    const res = await fetch("/api/supply-routes", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ sourceEnterpriseId: srcId, targetEnterpriseId: tgtId, productId: prodId, qtyPerTick: q }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Помилка"); return; }
    onCreated();
    onClose();
  }

  const selectedItem = srcInventory.find((i) => i.productId === prodId);

  return (
    <Dialog open title="Новий маршрут постачання" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-500">
          Маршрут автоматично передає товар між підприємствами кожен тік (якщо на джерелі є запас).
        </p>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Джерело (звідки везуть) *</label>
          <select
            value={srcId}
            onChange={(e) => handleSrcChange(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Оберіть підприємство…</option>
            {enterprises.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Товар *</label>
          {srcId && srcInventory.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
              <AlertCircle size={12} /> На цьому підприємстві немає товарів
            </div>
          ) : (
            <select
              value={prodId}
              onChange={(e) => setProdId(e.target.value)}
              required
              disabled={!srcId}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
            >
              <option value="">{srcId ? "Оберіть товар…" : "Спочатку оберіть джерело"}</option>
              {srcInventory.map((item) => (
                <option key={item.productId} value={item.productId}>
                  {item.productName} — {item.quantity.toFixed(1)} {item.unit}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Ціль (куди везуть) *</label>
          <select
            value={tgtId}
            onChange={(e) => setTgtId(e.target.value)}
            required
            disabled={!srcId}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
          >
            <option value="">Оберіть підприємство…</option>
            {tgtOptions.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Кількість / тік
            {selectedItem && (
              <span className="text-gray-600 ml-1">
                (наявно: {selectedItem.quantity.toFixed(1)} {selectedItem.unit})
              </span>
            )}
            {" "}*
          </label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            min={0.01}
            step={0.01}
            placeholder="0"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Скасувати</Button>
          <Button type="submit" loading={saving} className="flex-1">
            <Truck size={14} /> Додати маршрут
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupplyRoutesPage() {
  const [routes,      setRoutes]      = useState<Route[]>([]);
  const [enterprises, setEnterprises] = useState<EntOption[]>([]);
  const [entWithInv,  setEntWithInv]  = useState<EntWithInv[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [view,        setView]        = useState<"list" | "graph">("list");
  const [search,      setSearch]      = useState("");
  const [bulkBusy,    setBulkBusy]    = useState<"all-on" | "all-off" | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/supply-routes").then((r) => r.json()),
      fetch("/api/enterprises").then((r) => r.json()),
      fetch("/api/warehouses").then((r) => r.json()),
    ]).then(([sr, ents, ware]) => {
      setRoutes(sr.routes ?? []);
      setEnterprises((ents.enterprises ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
      setEntWithInv(
        (ware.enterprises ?? []).map((e: EntWithInv) => ({
          id   : e.id,
          name : e.name,
          items: e.items.map((i: InvProduct) => ({
            productId  : i.productId,
            productName: i.productName,
            unit       : i.unit,
            quantity   : i.quantity,
          })),
        }))
      );
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Bulk toggle ───────────────────────────────────────────────────────────────
  async function bulkToggle(activate: boolean) {
    setBulkBusy(activate ? "all-on" : "all-off");
    const targets = routes.filter((r) => r.isActive !== activate);
    await Promise.all(
      targets.map((r) =>
        fetch(`/api/supply-routes/${r.id}`, {
          method : "PATCH",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ isActive: activate }),
        })
      )
    );
    setRoutes((prev) => prev.map((r) => ({ ...r, isActive: activate })));
    setBulkBusy(null);
  }

  // ── Optimistic handlers ───────────────────────────────────────────────────────
  function handleToggle(id: string) {
    setRoutes((prev) => prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  }
  function handleDelete(id: string) {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  }
  function handleQtyChange(id: string, qty: number) {
    setRoutes((prev) => prev.map((r) => r.id === id ? { ...r, qtyPerTick: qty } : r));
  }

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const activeCount   = routes.filter((r) => r.isActive).length;
  const totalQtyTick  = routes.filter((r) => r.isActive).reduce((s, r) => s + r.qtyPerTick, 0);
  const uniqueProducts = new Set(routes.map((r) => r.productId)).size;
  const lowStockCount  = routes.filter((r) => r.isActive && stockLevel(r.sourceQty, r.qtyPerTick) !== "ok").length;

  // ── Filtered routes ───────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    if (!search.trim()) return routes;
    const q = search.toLowerCase();
    return routes.filter((r) =>
      r.productName.toLowerCase().includes(q) ||
      r.sourceName.toLowerCase().includes(q) ||
      r.targetName.toLowerCase().includes(q),
    );
  }, [routes, search]);

  const grouped = groupBySource(visible);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck size={22} className="text-blue-400" />
            Маршрути постачання
            {lowStockCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-400 font-normal bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} />
                {lowStockCount} мало запасу
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Автоматичне перевезення товарів між підприємствами кожен тік
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Новий маршрут
        </Button>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Всього маршрутів</p>
            <p className="text-xl font-bold text-white font-mono">{routes.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-3">
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-1">Активних</p>
            <p className="text-xl font-bold text-emerald-400 font-mono">{activeCount}</p>
            {routes.length - activeCount > 0 && (
              <p className="text-[10px] text-gray-600 mt-0.5">{routes.length - activeCount} зупинено</p>
            )}
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3">
            <p className="text-[10px] text-blue-500/70 uppercase tracking-wider mb-1">Обсяг / тік</p>
            <p className="text-xl font-bold text-blue-400 font-mono">{formatNumber(Math.round(totalQtyTick))}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Унікальних товарів</p>
            <p className="text-xl font-bold text-white font-mono">{uniqueProducts}</p>
          </div>
        </div>
      )}

      {/* Controls bar */}
      {!loading && routes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 flex-1 min-w-[180px]">
            <Search size={13} className="text-gray-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за товаром або підприємством…"
              className="bg-transparent text-sm text-white placeholder-gray-600 outline-none w-full"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700/50 p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", view === "list" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white")}
            >
              <LayoutList size={13} /> Список
            </button>
            <button
              onClick={() => setView("graph")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", view === "graph" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white")}
            >
              <GitFork size={13} /> Граф
            </button>
          </div>

          {/* Bulk toggle */}
          {activeCount < routes.length && (
            <button
              onClick={() => bulkToggle(true)}
              disabled={bulkBusy !== null}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-950/20 border border-emerald-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {bulkBusy === "all-on" ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Активувати всі
            </button>
          )}
          {activeCount > 0 && (
            <button
              onClick={() => bulkToggle(false)}
              disabled={bulkBusy !== null}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-950/20 border border-amber-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {bulkBusy === "all-off" ? <Loader2 size={12} className="animate-spin" /> : <ZapOff size={12} />}
              Зупинити всі
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              {Array.from({ length: 2 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <Truck size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Маршрутів ще немає</p>
          <p className="text-gray-600 text-xs mt-1 mb-4">
            Маршрути дозволяють автоматично переміщувати товари між підприємствами
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={13} /> Створити перший маршрут
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-12 text-center">
          <Search size={24} className="text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Маршрутів за запитом не знайдено</p>
          <button onClick={() => setSearch("")} className="text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors">
            Скинути пошук
          </button>
        </div>
      ) : view === "graph" ? (
        <div className="space-y-5">
          <FlowGraph routes={visible} />
          {routes.length > 1 && <ProductSummary routes={visible} />}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([srcId, { sourceName, routes: srcRoutes }]) => (
            <div key={srcId} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <Building2 size={13} className="text-emerald-400" />
                <span className="text-sm font-semibold text-white">{sourceName}</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {srcRoutes.filter((r) => r.isActive).length}/{srcRoutes.length} активних
                </span>
              </div>
              {srcRoutes.map((r) => (
                <RouteRow
                  key={r.id}
                  route={r}
                  onToggle={() => handleToggle(r.id)}
                  onDelete={() => handleDelete(r.id)}
                  onQtyChange={(qty) => handleQtyChange(r.id, qty)}
                />
              ))}
            </div>
          ))}

          {!search && (
            <>
              {routes.length > 1 && <ProductSummary routes={routes} />}
              <button
                onClick={() => setShowCreate(true)}
                className="w-full rounded-xl border border-dashed border-gray-800 py-4 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-600 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus size={14} /> Додати ще маршрут
              </button>
            </>
          )}
        </div>
      )}

      {showCreate && (
        <CreateRouteModal
          enterprises={enterprises}
          entWithInv={entWithInv}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
