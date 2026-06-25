"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot, Plus, Trash2, Check, X, Loader2,
  Building2, AlertCircle, ToggleLeft, ToggleRight,
  Pencil, Clock, Search, ShoppingCart, AlertTriangle,
  TrendingDown, Zap, ZapOff, CheckCircle2, XCircle, Package,
  ScrollText, RefreshCw,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Rule {
  id              : string;
  enterpriseId    : string;
  enterpriseName  : string;
  productId       : string;
  productName     : string;
  productUnit     : string;
  basePrice       : number;
  isActive        : boolean;
  minStockTicks   : number;
  maxPricePerUnit : number;
  lastTriggeredAt : string | null;
  currentQty      : number;
  minMarketPrice  : number | null;
  offersCount     : number;
}

interface EntOption { id: string; name: string }
interface ProdOption { id: string; name: string; unit: string; basePrice: number }

// ─── Rule status ──────────────────────────────────────────────────────────────

type RuleStatus = "inactive" | "ok" | "low" | "no_offers" | "too_expensive";

function getRuleStatus(rule: Rule): RuleStatus {
  if (!rule.isActive) return "inactive";
  if (rule.offersCount === 0) return "no_offers";
  if (rule.minMarketPrice !== null && rule.minMarketPrice > rule.maxPricePerUnit) return "too_expensive";
  if (rule.currentQty <= 0) return "low";
  return "ok";
}

const STATUS_CFG: Record<RuleStatus, {
  dot  : string;
  badge: string;
  label: string;
  icon : React.ElementType;
}> = {
  ok           : { dot: "bg-emerald-500", badge: "bg-emerald-950/50 text-emerald-400 border-emerald-900/40",     label: "Готове",      icon: CheckCircle2   },
  low          : { dot: "bg-amber-500",   badge: "bg-amber-950/50 text-amber-400 border-amber-900/40",           label: "Запас мало",  icon: AlertTriangle  },
  no_offers    : { dot: "bg-gray-600",    badge: "bg-gray-800/60 text-gray-500 border-gray-700/40",              label: "Немає офер.", icon: Package        },
  too_expensive: { dot: "bg-red-500",     badge: "bg-red-950/50 text-red-400 border-red-900/40",                 label: "Ціна зависок", icon: TrendingDown  },
  inactive     : { dot: "bg-gray-700",    badge: "bg-gray-800/40 text-gray-600 border-gray-800",                 label: "Неактивне",   icon: ZapOff         },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByEnterprise(rules: Rule[]) {
  const map = new Map<string, { name: string; rules: Rule[] }>();
  for (const r of rules) {
    if (!map.has(r.enterpriseId)) map.set(r.enterpriseId, { name: r.enterpriseName, rules: [] });
    map.get(r.enterpriseId)!.rules.push(r);
  }
  return map;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Rule Row ─────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onUpdated,
  onDeleted,
}: {
  rule     : Rule;
  onUpdated: (updated: Partial<Rule>) => void;
  onDeleted: () => void;
}) {
  const [editing,  setEditing]  = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [ticks,    setTicks]    = useState(rule.minStockTicks);
  const [price,    setPrice]    = useState(rule.maxPricePerUnit);

  const status = getRuleStatus(rule);
  const cfg    = STATUS_CFG[status];
  const Icon   = cfg.icon;

  const canAfford = rule.minMarketPrice !== null && rule.minMarketPrice <= rule.maxPricePerUnit;
  const priceRatio = rule.minMarketPrice !== null && rule.maxPricePerUnit > 0
    ? rule.minMarketPrice / rule.maxPricePerUnit
    : null;

  async function handleToggle() {
    setToggling(true);
    const res = await fetch(`/api/auto-replenish/${rule.id}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ isActive: !rule.isActive }),
    });
    setToggling(false);
    if (res.ok) onUpdated({ isActive: !rule.isActive });
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/auto-replenish/${rule.id}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ minStockTicks: ticks, maxPricePerUnit: price }),
    });
    setSaving(false);
    if (res.ok) { onUpdated({ minStockTicks: ticks, maxPricePerUnit: price }); setEditing(false); }
  }

  async function handleDelete() {
    if (!confirm(`Видалити правило для "${rule.productName}"?`)) return;
    setDeleting(true);
    await fetch(`/api/auto-replenish/${rule.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className={cn(
      "border-b border-gray-800 last:border-0 transition-colors",
      !rule.isActive ? "opacity-50 hover:bg-gray-800/20" : "hover:bg-gray-800/20",
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status dot */}
        <div className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} title={cfg.label} />

        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={cn(
            "shrink-0 transition-colors",
            rule.isActive ? "text-blue-400 hover:text-blue-300" : "text-gray-600 hover:text-gray-400",
          )}
        >
          {toggling
            ? <Loader2 size={16} className="animate-spin" />
            : rule.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />
          }
        </button>

        {/* Product + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">{rule.productName}</span>
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border", cfg.badge)}>
              <Icon size={9} />
              {cfg.label}
            </span>
          </div>
          {rule.lastTriggeredAt && (
            <span className="text-[10px] text-gray-600 inline-flex items-center gap-0.5 mt-0.5">
              <Clock size={9} /> Спрацював {fmtDate(rule.lastTriggeredAt)}
            </span>
          )}
        </div>

        {/* Params */}
        {!editing && (
          <div className="hidden sm:flex flex-col items-end gap-0.5 text-xs text-gray-500 shrink-0 mr-2">
            <span>
              мін <span className="font-mono text-white">{rule.minStockTicks}</span> тік
            </span>
            <span>
              макс <span className="font-mono text-white">₴{formatNumber(rule.maxPricePerUnit)}</span>/{rule.productUnit}
            </span>
          </div>
        )}

        {/* Controls */}
        {!editing ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => { setTicks(rule.minStockTicks); setPrice(rule.maxPricePerUnit); setEditing(true); }}
              className="text-gray-600 hover:text-white transition-colors p-1" title="Редагувати">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="text-gray-600 hover:text-red-400 transition-colors p-1">
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleSave} disabled={saving} className="text-emerald-400 hover:text-emerald-300 p-1">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            </button>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white p-1">
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Edit fields */}
      {editing && (
        <div className="flex items-center gap-3 px-4 pb-3 pl-14 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Мін запас (тіків)</label>
            <input
              type="number" min={1} max={100} value={ticks}
              onChange={(e) => setTicks(Math.max(1, Math.min(100, +e.target.value)))}
              className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Макс ціна/{rule.productUnit}</label>
            <input
              type="number" min={0.01} step={0.01} value={price}
              onChange={(e) => setPrice(+e.target.value)}
              className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          {rule.minMarketPrice !== null && (
            <span className="text-[10px] text-gray-600">
              мін на ринку: ₴{rule.minMarketPrice.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Market info strip */}
      {rule.isActive && (
        <div className="flex items-center gap-4 px-4 pb-3 pl-14 flex-wrap text-[10px]">
          {/* Current stock */}
          <span className={cn(
            "flex items-center gap-1",
            rule.currentQty > 0 ? "text-gray-500" : "text-red-400",
          )}>
            <Package size={9} />
            Запас: <span className="font-mono ml-0.5">
              {rule.currentQty > 0 ? `${formatNumber(Math.round(rule.currentQty))} ${rule.productUnit}` : "0"}
            </span>
          </span>

          {/* Market price */}
          {rule.minMarketPrice !== null ? (
            <span className={cn(
              "flex items-center gap-1",
              canAfford ? "text-emerald-500" : "text-red-400",
            )}>
              <ShoppingCart size={9} />
              Ринок: <span className="font-mono ml-0.5">₴{rule.minMarketPrice.toFixed(2)}</span>
              {canAfford
                ? <CheckCircle2 size={9} className="text-emerald-500" />
                : <XCircle size={9} className="text-red-400" />
              }
              {priceRatio !== null && (
                <span className={cn("ml-0.5", canAfford ? "text-emerald-600" : "text-red-500")}>
                  ({(priceRatio * 100).toFixed(0)}% від макс)
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-700 flex items-center gap-1">
              <ShoppingCart size={9} />
              Пропозицій немає
            </span>
          )}

          {/* Offers count */}
          {rule.offersCount > 0 && (
            <span className="text-gray-700">{rule.offersCount} офер.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Rule Modal ────────────────────────────────────────────────────────

function CreateRuleModal({
  enterprises,
  products,
  onClose,
  onCreated,
}: {
  enterprises: EntOption[];
  products   : ProdOption[];
  onClose    : () => void;
  onCreated  : () => void;
}) {
  const [entId,  setEntId]  = useState("");
  const [prodId, setProdId] = useState("");
  const [ticks,  setTicks]  = useState(3);
  const [price,  setPrice]  = useState(0);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const selProd = products.find((p) => p.id === prodId);

  function handleProdChange(id: string) {
    setProdId(id);
    const p = products.find((x) => x.id === id);
    if (p && price === 0) setPrice(+(p.basePrice * 2).toFixed(2));
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!entId)     { setError("Оберіть підприємство"); return; }
    if (!prodId)    { setError("Оберіть товар"); return; }
    if (price <= 0) { setError("Макс ціна має бути > 0"); return; }
    setSaving(true);
    const res = await fetch(`/api/enterprises/${entId}/replenish`, {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ productId: prodId, isActive: true, minStockTicks: ticks, maxPricePerUnit: price }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Помилка"); return; }
    onCreated();
    onClose();
  }

  return (
    <Dialog open title="Нове правило автопостачання" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-500">
          Система автоматично купить товар на ринку, коли запас на підприємстві впаде нижче порогу.
        </p>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Підприємство *</label>
          <select
            value={entId}
            onChange={(e) => setEntId(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Оберіть підприємство…</option>
            {enterprises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Товар *</label>
          <select
            value={prodId}
            onChange={(e) => handleProdChange(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Оберіть товар…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Мін. запас (тіків) *</label>
            <input
              type="number" min={1} max={100} value={ticks}
              onChange={(e) => setTicks(Math.max(1, Math.min(100, +e.target.value)))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">{"купує коли запасу < N тіків"}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Макс ціна{selProd ? `/${selProd.unit}` : ""} *
            </label>
            <input
              type="number" min={0.01} step={0.01} value={price || ""}
              onChange={(e) => setPrice(+e.target.value)}
              placeholder="₴"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
            />
            {selProd && (
              <p className="text-[10px] text-gray-600 mt-1">базова ₴{selProd.basePrice}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Скасувати</Button>
          <Button type="submit" loading={saving} className="flex-1">
            <Bot size={14} /> Додати правило
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── AutoContract types ───────────────────────────────────────────────────────

interface AContract {
  id:               string;
  resourceType:     string;
  productName:      string;
  productUnit:      string;
  quantityPerTick:  number;
  maxPricePerUnit:  number;
  minQuality:       number;
  isActive:         boolean;
  lastFilledQty:    number;
  lastTickSpentUah: number;
  totalSpentUah:    number;
  lastExecutedTick: string | null;
}

interface ACData {
  cashBalance:       number;
  committedPerTick:  number;
  contracts:         AContract[];
}

// ─── AutoContracts tab ────────────────────────────────────────────────────────

interface SkuOption { sku: string; nameUa: string; unit: string }

function AutoContractsTab() {
  const [acData,     setAcData]     = useState<ACData | null>(null);
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [acLoading,  setAcLoading]  = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy,       setBusy]       = useState<string | null>(null);

  // Create form
  const [newSku,   setNewSku]   = useState("");
  const [newQty,   setNewQty]   = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newQual,  setNewQual]  = useState("0");

  const loadAC = useCallback(async () => {
    const [acRes, prodRes] = await Promise.all([
      fetch("/api/auto-contract"),
      fetch("/api/products"),
    ]);
    if (acRes.ok)   setAcData(await acRes.json());
    if (prodRes.ok) {
      const pd = await prodRes.json();
      setSkuOptions((pd.products ?? []).map((p: { sku: string; nameUa: string; unit: string }) => ({
        sku: p.sku, nameUa: p.nameUa, unit: p.unit,
      })));
    }
    setAcLoading(false);
  }, []);

  useEffect(() => { loadAC(); }, [loadAC]);

  async function toggleContract(c: AContract) {
    setBusy(c.id);
    await fetch(`/api/auto-contract?id=${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isActive: !c.isActive }),
    });
    setAcData((prev) => prev ? {
      ...prev,
      contracts: prev.contracts.map((x) => x.id === c.id ? { ...x, isActive: !c.isActive } : x),
    } : prev);
    setBusy(null);
  }

  async function deleteContract(id: string) {
    if (!confirm("Видалити авто-контракт?")) return;
    setBusy(id);
    await fetch(`/api/auto-contract?id=${id}`, { method: "DELETE" });
    setAcData((prev) => prev ? { ...prev, contracts: prev.contracts.filter((c) => c.id !== id) } : prev);
    setBusy(null);
  }

  async function createContract() {
    if (!newSku || !newQty || !newPrice) return;
    setBusy("create");
    const res = await fetch("/api/auto-contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        resourceType:    newSku,
        quantityPerTick: Number(newQty),
        maxPricePerUnit: Number(newPrice),
        minQuality:      Number(newQual),
      }),
    });
    setBusy(null);
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Помилка"); return; }
    setNewSku(""); setNewQty(""); setNewPrice(""); setNewQual("0");
    setShowCreate(false);
    loadAC();
  }

  if (acLoading) return <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-600" /></div>;

  const data = acData ?? { cashBalance: 0, committedPerTick: 0, contracts: [] };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Всього контрактів</p>
          <p className="text-xl font-bold text-white font-mono">{data.contracts.length}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{data.contracts.filter((c) => c.isActive).length} активних</p>
        </div>
        <div className="rounded-xl border border-red-900/30 bg-red-950/10 px-4 py-3">
          <p className="text-[10px] text-red-500/70 uppercase tracking-wider mb-1">Витрат/тік (план)</p>
          <p className="text-xl font-bold text-red-400 font-mono">−{formatNumber(Math.round(data.committedPerTick))}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Баланс</p>
          <p className="text-xl font-bold text-white font-mono">{formatNumber(Math.round(data.cashBalance))} ₴</p>
          {data.committedPerTick > 0 && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              ≈ {Math.floor(data.cashBalance / data.committedPerTick)} тіків запасу
            </p>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {data.contracts.map((c) => {
          const fillPct = c.quantityPerTick > 0 ? Math.round((c.lastFilledQty / c.quantityPerTick) * 100) : 0;
          return (
            <div key={c.id} className={cn(
              "rounded-xl border bg-gray-900 px-4 py-3 flex items-start gap-3",
              c.isActive ? "border-gray-800" : "border-gray-800/40 opacity-60",
            )}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{c.productName}</span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {c.quantityPerTick} {c.productUnit}/тік · макс ₴{formatNumber(Math.round(c.maxPricePerUnit))}/од
                  </span>
                  {c.minQuality > 0 && (
                    <span className="text-[10px] text-yellow-500/70">★ ≥{(c.minQuality * 100).toFixed(0)}%</span>
                  )}
                </div>
                {c.lastExecutedTick && (
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="flex-1 max-w-[160px]">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-0.5">
                        <span>Виконано</span>
                        <span>{fillPct}%</span>
                      </div>
                      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", fillPct >= 80 ? "bg-emerald-500" : fillPct >= 40 ? "bg-yellow-500" : "bg-red-500")}
                          style={{ width: `${fillPct}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-600">тік #{c.lastExecutedTick}</span>
                    <span className="text-[10px] text-red-400 font-mono">−{formatNumber(Math.round(c.lastTickSpentUah))} ₴</span>
                  </div>
                )}
                <p className="text-[10px] text-gray-600 mt-1">Всього витрачено: ₴{formatNumber(Math.round(c.totalSpentUah))}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleContract(c)}
                  disabled={busy === c.id}
                  className="text-gray-500 hover:text-white transition-colors"
                  title={c.isActive ? "Призупинити" : "Активувати"}
                >
                  {busy === c.id ? <Loader2 size={15} className="animate-spin" /> :
                    c.isActive ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => deleteContract(c.id)}
                  disabled={busy === c.id}
                  className="text-gray-700 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {data.contracts.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm">
            Авто-контрактів ще немає. Створіть перший — система буде купувати ресурси щотіка.
          </div>
        )}

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="w-full rounded-xl border border-dashed border-gray-800 py-3 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-600 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={14} /> {showCreate ? "Скасувати" : "Новий авто-контракт"}
        </button>

        {showCreate && (
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-4 space-y-3">
            <p className="text-sm font-semibold text-white">Новий авто-контракт</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Товар</label>
                <select
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                >
                  <option value="">Оберіть товар…</option>
                  {skuOptions.map((p) => (
                    <option key={p.sku} value={p.sku}>{p.nameUa} ({p.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Кількість на тік</label>
                <input
                  type="number" min={0.01} step={0.01} value={newQty} onChange={(e) => setNewQty(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                  placeholder="напр. 100"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Макс. ціна/од. (₴)</label>
                <input
                  type="number" min={1} step={1} value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                  placeholder="напр. 5000"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Мін. якість (0–100%)</label>
                <input
                  type="number" min={0} max={100} step={1} value={newQual} onChange={(e) => setNewQual(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createContract} disabled={busy === "create" || !newSku || !newQty || !newPrice}>
                {busy === "create" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Створити
              </Button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500 hover:text-white transition-colors px-3">
                Скасувати
              </button>
            </div>
          </div>
        )}
      </div>

      <button onClick={loadAC} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors mx-auto pt-1">
        <RefreshCw size={10} /> Оновити
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutoReplenishPage() {
  const [tab,         setTab]         = useState<"rules" | "contracts">("rules");
  const [rules,       setRules]       = useState<Rule[]>([]);
  const [enterprises, setEnterprises] = useState<EntOption[]>([]);
  const [products,    setProducts]    = useState<ProdOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [search,      setSearch]      = useState("");
  const [bulkBusy,    setBulkBusy]    = useState<"on" | "off" | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/auto-replenish").then((r) => r.json()),
      fetch("/api/enterprises").then((r) => r.json()),
      fetch("/api/analytics/market").then((r) => r.json()),
    ]).then(([ar, ents, mkt]) => {
      setRules(ar.rules ?? []);
      setEnterprises((ents.enterprises ?? []).map((e: EntOption) => ({ id: e.id, name: e.name })));
      setProducts((mkt.products ?? []).map((p: ProdOption) => ({
        id: p.id, name: p.name, unit: p.unit, basePrice: p.basePrice,
      })));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function bulkToggle(activate: boolean) {
    setBulkBusy(activate ? "on" : "off");
    const targets = rules.filter((r) => r.isActive !== activate);
    await Promise.all(
      targets.map((r) =>
        fetch(`/api/auto-replenish/${r.id}`, {
          method : "PATCH",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ isActive: activate }),
        })
      )
    );
    setRules((prev) => prev.map((r) => ({ ...r, isActive: activate })));
    setBulkBusy(null);
  }

  function handleUpdated(id: string, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }
  function handleDeleted(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  // ── Filtered ──────────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase();
    return rules.filter((r) =>
      r.productName.toLowerCase().includes(q) ||
      r.enterpriseName.toLowerCase().includes(q),
    );
  }, [rules, search]);

  const grouped = groupByEnterprise(visible);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const activeCount    = rules.filter((r) => r.isActive).length;
  const entCount       = new Set(rules.map((r) => r.enterpriseId)).size;
  const problemCount   = rules.filter((r) => {
    const s = getRuleStatus(r);
    return s === "too_expensive" || s === "no_offers";
  }).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot size={22} className="text-blue-400" />
            Автопостачання
            {tab === "rules" && problemCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400 font-normal bg-red-950/40 border border-red-900/50 px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} />
                {problemCount} проблем
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {tab === "rules" ? "Система сама купить товар коли запас впаде нижче порогу" : "B2B авто-контракти — автоматична закупівля кожного тіка"}
          </p>
        </div>
        {tab === "rules" && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Нове правило
          </Button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-800">
        {([
          { key: "rules"     as const, label: "Правила поповнення", icon: Bot },
          { key: "contracts" as const, label: "B2B Авто-контракти", icon: ScrollText },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-px",
              tab === key ? "text-blue-400 border-blue-400" : "text-gray-500 border-transparent hover:text-white"
            )}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* AutoContracts tab */}
      {tab === "contracts" && <AutoContractsTab />}

      {/* Rules tab */}
      {tab === "rules" && <>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Всього правил</p>
            <p className="text-xl font-bold text-white font-mono">{rules.length}</p>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3">
            <p className="text-[10px] text-blue-500/70 uppercase tracking-wider mb-1">Активних</p>
            <p className="text-xl font-bold text-blue-400 font-mono">{activeCount}</p>
            {rules.length - activeCount > 0 && (
              <p className="text-[10px] text-gray-600 mt-0.5">{rules.length - activeCount} вимк.</p>
            )}
          </div>
          <div className="rounded-xl border border-purple-900/30 bg-purple-950/10 px-4 py-3">
            <p className="text-[10px] text-purple-500/70 uppercase tracking-wider mb-1">Підприємств</p>
            <p className="text-xl font-bold text-purple-400 font-mono">{entCount}</p>
          </div>
          <div className={cn(
            "rounded-xl border px-4 py-3",
            problemCount > 0 ? "border-red-900/30 bg-red-950/10" : "border-gray-800 bg-gray-900",
          )}>
            <p className={cn("text-[10px] uppercase tracking-wider mb-1", problemCount > 0 ? "text-red-500/70" : "text-gray-500")}>
              Проблем
            </p>
            <p className={cn("text-xl font-bold font-mono", problemCount > 0 ? "text-red-400" : "text-gray-600")}>
              {problemCount}
            </p>
            {problemCount === 0 && <p className="text-[10px] text-emerald-500/60 mt-0.5">Все ок</p>}
          </div>
        </div>
      )}

      {/* Controls */}
      {!loading && rules.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
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
          {activeCount < rules.length && (
            <button
              onClick={() => bulkToggle(true)}
              disabled={bulkBusy !== null}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-950/20 border border-blue-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {bulkBusy === "on" ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Активувати всі
            </button>
          )}
          {activeCount > 0 && (
            <button
              onClick={() => bulkToggle(false)}
              disabled={bulkBusy !== null}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-950/20 border border-amber-900/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {bulkBusy === "off" ? <Loader2 size={12} className="animate-spin" /> : <ZapOff size={12} />}
              Зупинити всі
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      {!loading && rules.some((r) => r.isActive) && (
        <div className="flex items-center gap-4 flex-wrap text-[10px] text-gray-600 px-1">
          {(Object.entries(STATUS_CFG) as [RuleStatus, typeof STATUS_CFG["ok"]][]).map(([key, c]) => (
            <span key={key} className="flex items-center gap-1">
              <span className={cn("w-2 h-2 rounded-full", c.dot)} />
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
              <Skeleton className="h-4 w-1/4" />
              {Array.from({ length: 2 }).map((_, j) => <Skeleton key={j} className="h-14 w-full" />)}
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <Bot size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Правил ще немає</p>
          <p className="text-gray-600 text-xs mt-1 mb-4 max-w-sm mx-auto">
            Автопостачання слідкує за запасами і автоматично розміщує заявки на ринку
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={13} /> Створити перше правило
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-12 text-center">
          <Search size={24} className="text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Правил за запитом не знайдено</p>
          <button onClick={() => setSearch("")} className="text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors">
            Скинути пошук
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([entId, { name, rules: entRules }]) => (
            <div key={entId} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <Building2 size={13} className="text-purple-400" />
                <span className="text-sm font-semibold text-white">{name}</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {entRules.filter((r) => r.isActive).length}/{entRules.length} активних
                </span>
              </div>
              {entRules.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  onUpdated={(patch) => handleUpdated(r.id, patch)}
                  onDeleted={() => handleDeleted(r.id)}
                />
              ))}
            </div>
          ))}

          {!search && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full rounded-xl border border-dashed border-gray-800 py-4 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-600 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={14} /> Додати ще правило
            </button>
          )}
        </div>
      )}

      {showCreate && (
        <CreateRuleModal
          enterprises={enterprises}
          products={products}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      </> /* end rules tab */}
    </div>
  );
}
