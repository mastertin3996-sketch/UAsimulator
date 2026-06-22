"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Tag, TrendingUp, TrendingDown, Minus, Check, X, Pencil,
  Trash2, ShoppingCart, PackageX, Clock,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyOffer {
  id          : string;
  productId   : string;
  productName : string;
  productUnit : string;
  productIcon : string | null;
  basePrice   : number;
  cityName    : string;
  price       : number;
  quantity    : number;
  qtySold     : number;
  qtyRemaining: number;
  minOrder    : number;
  quality     : number;
  status      : string;
  expiresAt   : string;
  createdAt   : string;
  priceVsBase : number;
  revenue     : number;
}

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE   : { label: "Активна",    color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800/50" },
  FILLED   : { label: "Розпродано", color: "text-blue-400",    bg: "bg-blue-950/40 border-blue-800/50" },
  CANCELLED: { label: "Скасована",  color: "text-gray-500",    bg: "bg-gray-800/40 border-gray-700/50" },
  EXPIRED  : { label: "Прострочена",color: "text-orange-400",  bg: "bg-orange-950/30 border-orange-800/40" },
};

// ─── PriceVsBase ──────────────────────────────────────────────────────────────

function PriceTag({ ratio }: { ratio: number }) {
  const pct = ((ratio - 1) * 100).toFixed(0);
  if (ratio <= 0.9) return <span className="text-[11px] text-green-400 flex items-center gap-0.5"><TrendingDown size={11} />−{Math.abs(Number(pct))}%</span>;
  if (ratio >= 1.1) return <span className="text-[11px] text-red-400 flex items-center gap-0.5"><TrendingUp size={11} />+{pct}%</span>;
  return <span className="text-[11px] text-gray-500 flex items-center gap-0.5"><Minus size={11} />{pct}%</span>;
}

// ─── PriceEditor ──────────────────────────────────────────────────────────────

function PriceEditor({ offer, onSaved }: { offer: MyOffer; onSaved: (id: string, price: number, minOrder: number) => void }) {
  const [editing,  setEditing]  = useState(false);
  const [price,    setPrice]    = useState(offer.price);
  const [minOrder, setMinOrder] = useState(offer.minOrder);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => { setPrice(offer.price); setMinOrder(offer.minOrder); }, [offer.price, offer.minOrder]);

  async function save() {
    if (price <= 0) { setErr("Ціна > 0"); return; }
    setSaving(true); setErr("");
    const res = await fetch(`/api/my-offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price, minOrder }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error ?? "Помилка"); return; }
    onSaved(offer.id, data.price, data.minOrder);
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
          placeholder="Ціна ₴"
        />
        <PriceTag ratio={newRatio} />
        <button onClick={save} disabled={saving} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-40"><Check size={13} /></button>
        <button onClick={() => { setEditing(false); setPrice(offer.price); setMinOrder(offer.minOrder); setErr(""); }} className="text-gray-500 hover:text-white"><X size={13} /></button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-600 w-20">Мін. зам.:</span>
        <input
          type="number" min={1} step={1} value={minOrder}
          onChange={(e) => setMinOrder(Number(e.target.value))}
          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none [appearance:textfield]"
        />
      </div>
      {err && <p className="text-[10px] text-red-400">{err}</p>}
    </div>
  );
}

// ─── OfferCard ────────────────────────────────────────────────────────────────

function OfferCard({ offer, onUpdate, onDelete }: {
  offer: MyOffer;
  onUpdate: (id: string, price: number, minOrder: number) => void;
  onDelete: (id: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const meta = STATUS_META[offer.status] ?? STATUS_META.ACTIVE;
  const isActive = offer.status === "ACTIVE";
  const soldPct  = offer.quantity > 0 ? (offer.qtySold / offer.quantity) * 100 : 0;
  const expDate  = new Date(offer.expiresAt);
  const daysLeft = Math.ceil((expDate.getTime() - Date.now()) / 86_400_000);

  async function cancel() {
    if (!confirm(`Скасувати оферту "${offer.productName}"?`)) return;
    setCancelling(true);
    const res = await fetch(`/api/my-offers/${offer.id}`, { method: "DELETE" });
    setCancelling(false);
    if (res.ok) onDelete(offer.id);
  }

  return (
    <div className={cn("rounded-xl border p-4 space-y-3 transition-all", isActive ? "bg-gray-900 border-gray-800" : "bg-gray-900/50 border-gray-800/50 opacity-70")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {offer.productIcon && <span className="text-lg shrink-0">{offer.productIcon}</span>}
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{offer.productName}</p>
            <p className="text-[11px] text-gray-500">{offer.cityName} · якість {offer.quality.toFixed(1)}</p>
          </div>
        </div>
        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0", meta.bg, meta.color)}>
          {meta.label}
        </span>
      </div>

      {/* Sold progress */}
      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
          <span>Продано: <span className="text-white">{formatNumber(offer.qtySold)}</span> / {formatNumber(offer.quantity)} {offer.productUnit}</span>
          <span className="text-emerald-400">{soldPct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", soldPct >= 100 ? "bg-blue-500" : "bg-emerald-500")}
            style={{ width: `${Math.min(100, soldPct)}%` }}
          />
        </div>
      </div>

      {/* Price row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] text-gray-600 mb-0.5">Ціна / {offer.productUnit}</p>
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
          <p className="text-[10px] text-gray-600 mb-0.5">Виручка</p>
          <p className="font-mono text-emerald-400 text-sm">+{formatNumber(Math.round(offer.revenue))} ₴</p>
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
          <span>мін. {formatNumber(offer.minOrder)} {offer.productUnit}</span>
          <span>
            {new Date(offer.createdAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
          </span>
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

export default function MyOffersClient() {
  const [offers,  setOffers]  = useState<MyOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<StatusFilter>("ACTIVE");

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    const res = await fetch(`/api/my-offers?status=${status}`);
    if (res.ok) {
      const d = await res.json();
      setOffers(d.offers);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [load, filter]);

  function handleUpdate(id: string, price: number, minOrder: number) {
    setOffers((prev) => prev.map((o) => o.id === id ? { ...o, price, minOrder, priceVsBase: o.basePrice > 0 ? price / o.basePrice : 1 } : o));
  }

  function handleDelete(id: string) {
    setOffers((prev) => prev.map((o) => o.id === id ? { ...o, status: "CANCELLED", qtyRemaining: 0 } : o));
  }

  const active   = offers.filter((o) => o.status === "ACTIVE");
  const revenue  = offers.reduce((s, o) => s + o.revenue, 0);
  const qtySold  = offers.reduce((s, o) => s + o.qtySold, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag size={22} className="text-emerald-400" /> Мої ринкові оферти
          </h1>
          <p className="text-gray-500 text-sm mt-1">Управління власними пропозиціями на B2B ринку</p>
        </div>
        <Link
          href="/market"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors shrink-0"
        >
          <ShoppingCart size={14} /> Виставити товар
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Активних офертів</p>
          <p className="text-2xl font-bold text-white">{active.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Виручка (показано)</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">+{formatNumber(Math.round(revenue))}</p>
          <p className="text-[10px] text-gray-600">GC</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Продано одиниць</p>
          <p className="text-2xl font-bold text-white font-mono">{formatNumber(Math.round(qtySold))}</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "ACTIVE",    label: "Активні" },
          { key: "ALL",       label: "Всі" },
          { key: "FILLED",    label: "Розпродані" },
          { key: "EXPIRED",   label: "Прострочені" },
          { key: "CANCELLED", label: "Скасовані" },
        ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filter === key ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Offers grid */}
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
            {filter === "ACTIVE" ? "Немає активних офертів" : "Офертів не знайдено"}
          </p>
          <Link href="/market" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm transition-colors">
            <ShoppingCart size={14} /> Виставити товар на ринку
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
