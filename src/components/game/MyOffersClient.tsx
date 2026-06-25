"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Tag, TrendingUp, TrendingDown, Minus, Check, X, Pencil,
  Trash2, ShoppingCart, PackageX, Clock, ArrowDownUp,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyOffer {
  id:           string;
  type:         "SELL" | "BUY";
  productId:    string;
  productName:  string;
  productUnit:  string;
  basePrice:    number;
  price:        number;
  quality:      number;
  qualityMin:   number;
  quantity:     number;
  qtyFilled:    number;
  qtyRemaining: number;
  status:       string;
  expiresAt:    string;
  createdAt:    string;
  priceVsBase:  number;
  value:        number; // revenue (SELL) or spend (BUY)
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE   : { label: "Активний",    color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800/50" },
  FILLED   : { label: "Виконано",    color: "text-blue-400",    bg: "bg-blue-950/40 border-blue-800/50" },
  CANCELLED: { label: "Скасовано",   color: "text-gray-500",    bg: "bg-gray-800/40 border-gray-700/50" },
  EXPIRED  : { label: "Прострочено", color: "text-orange-400",  bg: "bg-orange-950/30 border-orange-800/40" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PriceTag({ ratio }: { ratio: number }) {
  const pct = ((ratio - 1) * 100).toFixed(0);
  if (ratio <= 0.9) return <span className="text-[11px] text-green-400 flex items-center gap-0.5"><TrendingDown size={11} />−{Math.abs(Number(pct))}%</span>;
  if (ratio >= 1.1) return <span className="text-[11px] text-red-400 flex items-center gap-0.5"><TrendingUp size={11} />+{pct}%</span>;
  return <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><Minus size={11} />{pct}%</span>;
}

// ─── Price inline editor ──────────────────────────────────────────────────────

function PriceEditor({ offer, onSaved }: { offer: MyOffer; onSaved: (id: string, price: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [price,   setPrice]   = useState(offer.price);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  useEffect(() => { setPrice(offer.price); }, [offer.price]);

  async function save() {
    if (price <= 0) { setErr("Ціна > 0"); return; }
    setSaving(true); setErr("");
    const res = await fetch(`/api/my-offers/${offer.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ price }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error ?? "Помилка"); return; }
    onSaved(offer.id, data.price);
    setEditing(false);
  }

  const newRatio = offer.basePrice > 0 ? price / offer.basePrice : 1;

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-white text-sm">{formatNumber(offer.price)} ₴</span>
        <PriceTag ratio={offer.priceVsBase} />
        <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-300 transition-colors">
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number" min={0.01} step={1} value={price} autoFocus
          onChange={(e) => setPrice(Number(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-28 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 [appearance:textfield]"
        />
        <PriceTag ratio={newRatio} />
        <button onClick={save} disabled={saving} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40"><Check size={13} /></button>
        <button onClick={() => { setEditing(false); setPrice(offer.price); setErr(""); }} className="text-gray-500 hover:text-white"><X size={13} /></button>
      </div>
      {err && <p className="text-[10px] text-red-400">{err}</p>}
    </div>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ offer, onUpdate, onDelete }: {
  offer:    MyOffer;
  onUpdate: (id: string, price: number) => void;
  onDelete: (id: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const meta     = STATUS_META[offer.status] ?? STATUS_META.ACTIVE;
  const isActive = offer.status === "ACTIVE";
  const filledPct = offer.quantity > 0 ? (offer.qtyFilled / offer.quantity) * 100 : 0;
  const daysLeft  = Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 86_400_000);
  const isSell    = offer.type === "SELL";

  async function cancel() {
    if (!confirm(`Скасувати ${isSell ? "SELL" : "BUY"}-ордер "${offer.productName}"?`)) return;
    setCancelling(true);
    const res = await fetch(`/api/my-offers/${offer.id}`, { method: "DELETE" });
    setCancelling(false);
    if (res.ok) onDelete(offer.id);
  }

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-all",
      isActive ? "bg-gray-900 border-gray-800" : "bg-gray-900/50 border-gray-800/50 opacity-70",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold",
            isSell ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400",
          )}>
            {isSell ? "S" : "B"}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{offer.productName}</p>
            <p className="text-[11px] text-gray-500">
              {isSell ? `Якість ${offer.quality.toFixed(1)}` : `Мін. якість ${offer.qualityMin.toFixed(1)}`}
            </p>
          </div>
        </div>
        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0", meta.bg, meta.color)}>
          {meta.label}
        </span>
      </div>

      {/* Fill progress */}
      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
          <span>
            {isSell ? "Продано" : "Виконано"}: <span className="text-white">{formatNumber(offer.qtyFilled)}</span> / {formatNumber(offer.quantity)} {offer.productUnit}
          </span>
          <span className={isSell ? "text-emerald-400" : "text-blue-400"}>{filledPct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", filledPct >= 100 ? "bg-blue-500" : isSell ? "bg-emerald-500" : "bg-blue-400")}
            style={{ width: `${Math.min(100, filledPct)}%` }}
          />
        </div>
      </div>

      {/* Price row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] text-gray-600 mb-0.5">{isSell ? "Ціна продажу" : "Макс. ціна"} / {offer.productUnit}</p>
          {isActive ? (
            <PriceEditor offer={offer} onSaved={onUpdate} />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-white text-sm">{formatNumber(offer.price)} ₴</span>
              <PriceTag ratio={offer.priceVsBase} />
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-600 mb-0.5">{isSell ? "Виручка" : "Витрачено"}</p>
          <p className={cn("font-mono text-sm", isSell ? "text-emerald-400" : "text-blue-400")}>
            {isSell ? "+" : "−"}{formatNumber(Math.round(offer.value))} ₴
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-800/60">
        <div className="flex items-center gap-3 text-[10px] text-gray-600">
          {isActive && (
            <span className={cn("flex items-center gap-1", daysLeft <= 1 ? "text-orange-400" : "")}>
              <Clock size={10} /> {daysLeft > 0 ? `${daysLeft}д` : "сьогодні"}
            </span>
          )}
          <span>{new Date(offer.createdAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}</span>
          {!isSell && isActive && (
            <span className="text-[10px] text-gray-600">
              Потенц.: <span className="text-white font-mono">{formatNumber(Math.round(offer.qtyRemaining * offer.price))} ₴</span>
            </span>
          )}
        </div>
        {isActive && (
          <button
            onClick={cancel}
            disabled={cancelling}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            <Trash2 size={12} /> {cancelling ? "..." : "Скасувати"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type StatusFilter = "ACTIVE" | "ALL" | "FILLED" | "CANCELLED" | "EXPIRED";
type OrderType    = "SELL" | "BUY";

export default function MyOffersClient() {
  const [offers,    setOffers]    = useState<MyOffer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<StatusFilter>("ACTIVE");
  const [orderType, setOrderType] = useState<OrderType>("SELL");

  const load = useCallback(async (status: StatusFilter, type: OrderType) => {
    setLoading(true);
    const res = await fetch(`/api/my-offers?status=${status}&type=${type}`);
    if (res.ok) {
      const d = await res.json();
      setOffers(d.offers ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(filter, orderType); }, [load, filter, orderType]);

  function handleUpdate(id: string, price: number) {
    setOffers((prev) => prev.map((o) => o.id === id ? { ...o, price, priceVsBase: o.basePrice > 0 ? price / o.basePrice : 1 } : o));
  }

  function handleDelete(id: string) {
    setOffers((prev) => prev.map((o) => o.id === id ? { ...o, status: "CANCELLED", qtyRemaining: 0 } : o));
  }

  const active     = offers.filter((o) => o.status === "ACTIVE");
  const totalValue = offers.reduce((s, o) => s + o.value, 0);
  const totalFill  = offers.reduce((s, o) => s + o.qtyFilled, 0);

  const isSell = orderType === "SELL";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag size={22} className="text-emerald-400" /> Мої ордери
          </h1>
          <p className="text-gray-500 text-sm mt-1">Управління власними SELL та BUY ордерами</p>
        </div>
        <Link
          href="/market"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors shrink-0"
        >
          <ShoppingCart size={14} /> Виставити ордер
        </Link>
      </div>

      {/* Type toggle */}
      <div className="flex gap-1 p-1 bg-gray-900 border border-gray-800 rounded-xl w-fit">
        <button
          onClick={() => setOrderType("SELL")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
            orderType === "SELL" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white",
          )}
        >
          <ArrowDownUp size={13} /> SELL (продаю)
        </button>
        <button
          onClick={() => setOrderType("BUY")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
            orderType === "BUY" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white",
          )}
        >
          <ArrowDownUp size={13} /> BUY (купую)
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Активних</p>
          <p className="text-2xl font-bold text-white">{active.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">{isSell ? "Виручка" : "Витрачено"}</p>
          <p className={cn("text-2xl font-bold font-mono", isSell ? "text-emerald-400" : "text-blue-400")}>
            {isSell ? "+" : "−"}{formatNumber(Math.round(totalValue))}
          </p>
          <p className="text-[10px] text-gray-600">₴</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">{isSell ? "Продано" : "Куплено"} одиниць</p>
          <p className="text-2xl font-bold text-white font-mono">{formatNumber(Math.round(totalFill))}</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(["ACTIVE", "ALL", "FILLED", "EXPIRED", "CANCELLED"] as StatusFilter[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filter === key ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white",
            )}
          >
            {{ ACTIVE: "Активні", ALL: "Всі", FILLED: "Виконані", EXPIRED: "Прострочені", CANCELLED: "Скасовані" }[key]}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-44 animate-pulse" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <PackageX size={40} className="mx-auto text-gray-700" />
          <p className="text-gray-500">
            {filter === "ACTIVE"
              ? `Немає активних ${isSell ? "SELL" : "BUY"}-ордерів`
              : "Ордерів не знайдено"}
          </p>
          <Link href="/market" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm transition-colors">
            <ShoppingCart size={14} /> Відкрити ринок
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((o) => (
            <OrderCard key={o.id} offer={o} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
