"use client";

import { useEffect, useState } from "react";

interface Offer {
  id: string; enterpriseName: string; city: string; ownerName: string;
  ownerId: string; pricePerTick: number; capacityKg: number;
  description: string | null; tenantCount: number;
  isSubscribed: boolean; isOwnOffer: boolean;
}

interface MyWarehouse { id: string; name: string }

export function WarehouseClient() {
  const [offers,       setOffers]       = useState<Offer[]>([]);
  const [myWarehouses, setMyWarehouses] = useState<MyWarehouse[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState<string | null>(null);

  // Create offer form state
  const [showForm,   setShowForm]   = useState(false);
  const [formEntId,  setFormEntId]  = useState("");
  const [formPrice,  setFormPrice]  = useState("");
  const [formCap,    setFormCap]    = useState("");
  const [formDesc,   setFormDesc]   = useState("");
  const [formMsg,    setFormMsg]    = useState("");

  const load = async () => {
    setLoading(true);
    const [offerRes, entRes] = await Promise.all([
      fetch("/api/warehouse"),
      fetch("/api/enterprises"),
    ]);
    const { offers: o } = await offerRes.json();
    const { enterprises: e } = await entRes.json();
    setOffers(o ?? []);
    setMyWarehouses((e ?? []).filter((ent: { type: string; name: string; id: string }) => ent.type === "WAREHOUSE"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubscribe = async (offer: Offer) => {
    const action = offer.isSubscribed ? "unsubscribe" : "subscribe";
    const confirm_ = offer.isSubscribed
      ? window.confirm("Скасувати оренду складу?")
      : window.confirm(`Орендувати склад за ₴${offer.pricePerTick}/тік? Оплата знімається щотіку.`);
    if (!confirm_) return;

    setActing(offer.id);
    const res = await fetch(`/api/warehouse/${offer.id}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok) load();
    else alert(`✗ ${data.error}`);
    setActing(null);
  };

  const handleCreate = async () => {
    if (!formEntId || !formPrice || !formCap) { setFormMsg("Заповніть всі поля"); return; }
    const res = await fetch("/api/warehouse", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        enterpriseId: formEntId,
        pricePerTick: parseFloat(formPrice),
        capacityKg:   parseFloat(formCap),
        description:  formDesc || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) { setFormMsg("✓ Пропозицію розміщено!"); load(); setShowForm(false); }
    else setFormMsg(`✗ ${data.error}`);
  };

  const handleDeactivate = async (offerId: string) => {
    if (!confirm("Зняти пропозицію? Всі підписки анулюються.")) return;
    setActing(offerId);
    await fetch(`/api/warehouse/${offerId}`, { method: "DELETE" });
    load();
    setActing(null);
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ринок оренди складів</h1>
          <p className="text-sm text-gray-400 mt-1">
            Орендуйте складські потужності інших гравців або здавайте власні WAREHOUSE підприємства в оренду.
          </p>
        </div>
        {myWarehouses.length > 0 && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="shrink-0 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-2 font-medium transition-colors"
          >
            + Здати в оренду
          </button>
        )}
      </div>

      {/* Create offer form */}
      {showForm && (
        <div className="rounded-xl border border-emerald-600/30 bg-gray-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-emerald-400">Нова пропозиція оренди</p>
          <select value={formEntId} onChange={e => setFormEntId(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white">
            <option value="">— оберіть WAREHOUSE підприємство —</option>
            {myWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Ціна/тік (₴)</label>
              <input type="number" min={1} value={formPrice} onChange={e => setFormPrice(e.target.value)}
                placeholder="напр. 500" className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Ємність (кг)</label>
              <input type="number" min={100} value={formCap} onChange={e => setFormCap(e.target.value)}
                placeholder="напр. 50000" className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <input type="text" value={formDesc} onChange={e => setFormDesc(e.target.value)}
            placeholder="Опис (необов'язково)"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white" />
          {formMsg && <p className={`text-xs ${formMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{formMsg}</p>}
          <button onClick={handleCreate}
            className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm py-2 font-medium transition-colors">
            Розмістити пропозицію
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Завантаження...</p>
      ) : offers.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          Немає активних пропозицій. Першим здайте свій склад в оренду!
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map(o => (
            <div key={o.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white text-sm">{o.enterpriseName}</p>
                  <p className="text-xs text-gray-400">{o.city} · власник: {o.ownerName}</p>
                  {o.description && <p className="text-xs text-gray-500 mt-1">{o.description}</p>}
                </div>
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  o.isSubscribed ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-400"
                }`}>
                  {o.isSubscribed ? "✓ орендовано" : `${o.tenantCount} орендар${o.tenantCount === 1 ? "" : "ів"}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded bg-gray-800 px-3 py-2">
                  <p className="text-[10px] text-gray-500">Вартість</p>
                  <p className="text-sm font-semibold text-white">₴{o.pricePerTick.toLocaleString("uk-UA")}/тік</p>
                </div>
                <div className="rounded bg-gray-800 px-3 py-2">
                  <p className="text-[10px] text-gray-500">Ємність</p>
                  <p className="text-sm font-semibold text-white">{o.capacityKg.toLocaleString("uk-UA")} кг</p>
                </div>
              </div>

              {o.isOwnOffer ? (
                <button onClick={() => handleDeactivate(o.id)} disabled={acting === o.id}
                  className="w-full rounded-lg bg-red-900/40 hover:bg-red-900/60 border border-red-700/30 text-red-400 text-sm py-2 transition-colors disabled:opacity-50">
                  {acting === o.id ? "..." : "Зняти пропозицію"}
                </button>
              ) : (
                <button onClick={() => handleSubscribe(o)} disabled={acting === o.id}
                  className={`w-full rounded-lg text-sm py-2 font-medium transition-colors disabled:opacity-50 ${
                    o.isSubscribed
                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      : "bg-blue-700 hover:bg-blue-600 text-white"
                  }`}>
                  {acting === o.id ? "..." : o.isSubscribed ? "Скасувати оренду" : "Орендувати"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
