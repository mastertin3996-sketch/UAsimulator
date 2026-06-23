"use client";

import { useEffect, useState, useCallback } from "react";
import { Landmark, X, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { cn, formatUAH } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Deal {
  id: string; status: string;
  transactionAmountUah: number; listedAtTick: number;
  executedAtTick: number | null; canceledAtTick: number | null;
  notes: string | null; createdAt: string;
  sellerId: string; buyerId: string | null;
  targetEnterpriseId: string | null;
  sellerName: string; buyerName: string | null;
  enterprise: { name: string; type: string; city: string } | null;
}

interface MyEnterprise { id: string; name: string; type: string; city: string }

interface MaData {
  marketplace: Deal[];
  myListings:  Deal[];
  myPurchases: Deal[];
  myEnterprises: MyEnterprise[];
}

const ENT_TYPE_LABELS: Record<string, string> = {
  OFFICE: "Офіс", AGRO_FARM: "Агроферма", TEXTILE_FACTORY: "Текстиль",
  FOOD_PROCESSING: "Харчова", RETAIL_STORE: "Магазин",
  WAREHOUSE: "Склад", LOGISTICS_HUB: "Логістика", RD_LABORATORY: "R&D Лаб",
};

// ─── Create Listing Modal ────────────────────────────────────────────────────

function CreateListingModal({
  enterprises, onCreated, onClose,
}: { enterprises: MyEnterprise[]; onCreated: () => void; onClose: () => void }) {
  const [mode,    setMode]    = useState<"enterprise" | "company">("enterprise");
  const [entId,   setEntId]   = useState(enterprises[0]?.id ?? "");
  const [price,   setPrice]   = useState(500_000);
  const [notes,   setNotes]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  async function create() {
    setSaving(true); setErr("");
    const res = await fetch("/api/ma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetEnterpriseId: mode === "enterprise" ? entId : undefined,
        priceUah: price,
        notes: notes || undefined,
      }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? "Помилка"); setSaving(false); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Виставити на продаж</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["enterprise", "company"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={cn(
                  "py-2.5 rounded-lg border text-sm font-medium transition-all",
                  mode === m
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                    : "border-gray-800 bg-gray-900 text-gray-400 hover:text-white",
                )}>
                {m === "enterprise" ? "Підприємство" : "Вся компанія"}
              </button>
            ))}
          </div>

          {mode === "enterprise" && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Підприємство</label>
              {enterprises.length === 0 ? (
                <p className="text-xs text-gray-600">Немає операційних підприємств</p>
              ) : (
                <select value={entId} onChange={e => setEntId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                  {enterprises.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {ENT_TYPE_LABELS[e.type] ?? e.type} · {e.city}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {mode === "company" && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-xs text-amber-400">Продаж усієї компанії — всі підприємства переходять до покупця</p>
            </div>
          )}

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Ціна (UAH)</label>
              <span className="text-xs font-mono text-white">{formatUAH(price)}</span>
            </div>
            <input type="range" min={10_000} max={50_000_000} step={10_000}
              value={price} onChange={e => setPrice(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Нотатки (необов'язково)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Причина продажу, особливості..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-emerald-500" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={create} disabled={saving || (mode === "enterprise" && !entId)}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Виставити
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ───────────────────────────────────────────────────────────────

function DealCard({
  deal, playerId, onBuy, onCancel, buying, cancelling,
}: {
  deal: Deal; playerId?: string;
  onBuy: (id: string) => void; onCancel: (id: string) => void;
  buying: string | null; cancelling: string | null;
}) {
  const isSeller = deal.sellerId === playerId;

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      deal.status === "COMPLETED" ? "border-emerald-500/20 bg-emerald-500/5"
        : deal.status === "CANCELED" ? "border-gray-700 opacity-50"
        : "border-gray-800 bg-gray-900",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {deal.enterprise ? (
            <>
              <p className="text-sm font-semibold text-white">{deal.enterprise.name}</p>
              <p className="text-xs text-gray-500">{ENT_TYPE_LABELS[deal.enterprise.type] ?? deal.enterprise.type} · {deal.enterprise.city}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-white">Вся компанія</p>
          )}
          <p className="text-[10px] text-gray-600 mt-0.5">від {deal.sellerName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold font-mono text-emerald-400">{formatUAH(deal.transactionAmountUah)}</p>
          <span className={cn(
            "text-[10px] font-medium rounded-full px-2 py-0.5",
            deal.status === "PENDING"   ? "text-amber-400 bg-amber-500/10"
              : deal.status === "COMPLETED" ? "text-emerald-400 bg-emerald-500/10"
              : "text-gray-500 bg-gray-800",
          )}>
            {deal.status === "PENDING" ? "Активна" : deal.status === "COMPLETED" ? "Виконана" : "Скасована"}
          </span>
        </div>
      </div>

      {deal.notes && <p className="text-xs text-gray-400 italic">{deal.notes}</p>}

      {deal.status === "COMPLETED" && deal.buyerName && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <CheckCircle2 size={10} className="text-emerald-400" /> Придбала: {deal.buyerName}
        </p>
      )}

      {deal.status === "PENDING" && (
        <div className="flex gap-2 pt-1">
          {!isSeller && (
            <Button size="sm" className="flex-1 text-xs" onClick={() => onBuy(deal.id)} disabled={!!buying}>
              {buying === deal.id ? <Loader2 size={11} className="animate-spin mr-1" /> : null}
              Купити
            </Button>
          )}
          {isSeller && (
            <Button size="sm" variant="outline" className="flex-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => onCancel(deal.id)} disabled={!!cancelling}>
              {cancelling === deal.id ? <Loader2 size={11} className="animate-spin mr-1" /> : <X size={11} />}
              {" "}Зняти з продажу
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MaPage() {
  const [data,       setData]       = useState<MaData | null>(null);
  const [playerId,   setPlayerId]   = useState<string | undefined>();
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<"market" | "my" | "history">("market");
  const [createModal, setCreateModal] = useState(false);
  const [buying,     setBuying]     = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error,      setError]      = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/ma").then(r => r.json()),
      fetch("/api/me").then(r => r.json()).catch(() => ({})),
    ]).then(([maData, me]) => {
      setData(maData);
      setPlayerId(me?.id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function buy(dealId: string) {
    setBuying(dealId); setError("");
    const res = await fetch(`/api/ma/${dealId}/buy`, { method: "POST" });
    const d   = await res.json();
    if (!res.ok) { setError(d.error ?? "Помилка"); setBuying(null); return; }
    setBuying(null);
    load();
  }

  async function cancel(dealId: string) {
    setCancelling(dealId); setError("");
    const res = await fetch(`/api/ma/${dealId}`, { method: "DELETE" });
    const d   = await res.json();
    if (!res.ok) { setError(d.error ?? "Помилка"); setCancelling(null); return; }
    setCancelling(null);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-40 rounded bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-gray-800 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return <div className="py-16 text-center text-gray-500">Помилка завантаження</div>;

  const { marketplace, myListings, myPurchases, myEnterprises } = data;
  const activeListings = myListings.filter(d => d.status === "PENDING");
  const historyDeals   = [...myListings.filter(d => d.status !== "PENDING"), ...myPurchases]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark size={20} className="text-sky-400" /> M&A — Злиття та поглинання
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Купівля та продаж підприємств між гравцями</p>
        </div>
        <Button onClick={() => setCreateModal(true)}>
          <Landmark size={14} /> Виставити на продаж
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "На ринку", value: marketplace.length, color: "text-white" },
          { label: "Мої оголошення", value: activeListings.length, color: "text-amber-400" },
          { label: "Куплено всього", value: myPurchases.filter(d => d.status === "COMPLETED").length, color: "text-emerald-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={cn("text-lg font-bold font-mono mt-0.5", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {[
          { key: "market"  as const, label: `Ринок (${marketplace.length})` },
          { key: "my"      as const, label: `Мої оголошення (${activeListings.length})` },
          { key: "history" as const, label: `Історія (${historyDeals.length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "text-sky-400 border-sky-400" : "text-gray-500 border-transparent hover:text-white",
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* Market tab */}
      {tab === "market" && (
        <div className="space-y-3">
          {marketplace.length === 0 ? (
            <div className="py-12 text-center">
              <Landmark size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Поки немає пропозицій на ринку</p>
              <p className="text-xs text-gray-600 mt-1">Виставте підприємство на продаж, щоб інші гравці могли його придбати</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {marketplace.map(d => (
                <DealCard key={d.id} deal={d} playerId={playerId}
                  onBuy={buy} onCancel={cancel} buying={buying} cancelling={cancelling} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* My listings tab */}
      {tab === "my" && (
        <div className="space-y-3">
          {activeListings.length === 0 ? (
            <div className="py-12 text-center">
              <Clock size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Немає активних оголошень</p>
              <Button size="sm" className="mt-3" onClick={() => setCreateModal(true)}>
                Виставити підприємство
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeListings.map(d => (
                <DealCard key={d.id} deal={d} playerId={playerId}
                  onBuy={buy} onCancel={cancel} buying={buying} cancelling={cancelling} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="space-y-3">
          {historyDeals.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">Немає завершених угод</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {historyDeals.map(d => (
                <DealCard key={d.id} deal={d} playerId={playerId}
                  onBuy={buy} onCancel={cancel} buying={buying} cancelling={cancelling} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {createModal && (
        <CreateListingModal
          enterprises={myEnterprises}
          onCreated={() => { setCreateModal(false); load(); }}
          onClose={() => setCreateModal(false)}
        />
      )}
    </div>
  );
}
