"use client";

import { useEffect, useState } from "react";

interface Listing {
  id: string; landPlotId: string; sellerName: string; sellerId: string;
  city: string; totalAreaM2: number; usedAreaM2: number; soilQuality: number;
  askingPrice: number; isMyListing: boolean;
}

interface MyPlot { id: string; totalAreaM2: number; soilQuality: number; city: { nameUa: string }; status: string }

export function LandMarketClient() {
  const [listings,  setListings]  = useState<Listing[]>([]);
  const [myPlots,   setMyPlots]   = useState<MyPlot[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [acting,    setActing]    = useState<string | null>(null);

  const [showForm,  setShowForm]  = useState(false);
  const [formPlot,  setFormPlot]  = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formMsg,   setFormMsg]   = useState("");

  const load = async () => {
    setLoading(true);
    const [lr, pr] = await Promise.all([
      fetch("/api/land/listings"),
      fetch("/api/land/my"),
    ]);
    const ld = await lr.json();
    setListings(ld.listings ?? []);
    if (pr.ok) {
      const pd = await pr.json();
      setMyPlots((pd.plots ?? []).filter((p: MyPlot) => p.status === "OWNED"));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleBuy = async (listing: Listing) => {
    if (!confirm(`Купити ділянку ${listing.totalAreaM2} м² у ${listing.city} за ₴${listing.askingPrice.toLocaleString("uk-UA")}?`)) return;
    setActing(listing.id);
    const res  = await fetch(`/api/land/listings/${listing.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "buy" }),
    });
    const data = await res.json();
    if (res.ok) load();
    else alert(`✗ ${data.error}`);
    setActing(null);
  };

  const handleCancel = async (listing: Listing) => {
    setActing(listing.id);
    await fetch(`/api/land/listings/${listing.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "cancel" }),
    });
    load();
    setActing(null);
  };

  const handleList = async () => {
    if (!formPlot || !formPrice) { setFormMsg("Заповніть усі поля"); return; }
    const res  = await fetch("/api/land/listings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ landPlotId: formPlot, askingPrice: parseFloat(formPrice) }),
    });
    const data = await res.json();
    if (res.ok) { setFormMsg("✓ Виставлено!"); load(); setShowForm(false); }
    else setFormMsg(`✗ ${data.error}`);
  };

  const freePlots = myPlots.filter(p => !listings.some(l => l.landPlotId === p.id && l.isMyListing));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ринок землі</h1>
          <p className="text-sm text-gray-400 mt-1">Купуйте або продавайте земельні ділянки між гравцями.</p>
        </div>
        {freePlots.length > 0 && (
          <button onClick={() => setShowForm(v => !v)}
            className="shrink-0 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-2 font-medium transition-colors">
            + Продати ділянку
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-emerald-600/30 bg-gray-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-emerald-400">Нове оголошення</p>
          <select value={formPlot} onChange={e => setFormPlot(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white">
            <option value="">— оберіть ділянку —</option>
            {freePlots.map(p => <option key={p.id} value={p.id}>{p.city.nameUa} · {p.totalAreaM2} м² · ґрунт {p.soilQuality.toFixed(1)}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="number" min={1} value={formPrice} onChange={e => setFormPrice(e.target.value)}
              placeholder="Ціна (₴)" className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white" />
            <button onClick={handleList}
              className="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-4 py-2 font-medium transition-colors">
              Виставити
            </button>
          </div>
          {formMsg && <p className={`text-xs ${formMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{formMsg}</p>}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Завантаження...</p>
      ) : listings.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          Немає активних оголошень. Будь першим!
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map(l => (
            <div key={l.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white text-sm">🗺 {l.city} · {l.totalAreaM2.toLocaleString()} м²</p>
                  <p className="text-xs text-gray-400">Продавець: {l.sellerName} · Ґрунт: {l.soilQuality.toFixed(1)}/10
                    {l.usedAreaM2 > 0 && <span className="ml-2 text-amber-400">⚠ використано {l.usedAreaM2} м²</span>}
                  </p>
                </div>
                <p className="text-lg font-bold text-white shrink-0">₴{l.askingPrice.toLocaleString("uk-UA")}</p>
              </div>

              {l.isMyListing ? (
                <button onClick={() => handleCancel(l)} disabled={acting === l.id}
                  className="w-full rounded-lg bg-red-900/40 hover:bg-red-900/60 border border-red-700/30 text-red-400 text-sm py-2 transition-colors disabled:opacity-50">
                  {acting === l.id ? "..." : "Зняти оголошення"}
                </button>
              ) : (
                <button onClick={() => handleBuy(l)} disabled={acting === l.id}
                  className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm py-2 font-medium transition-colors disabled:opacity-50">
                  {acting === l.id ? "..." : `Купити за ₴${l.askingPrice.toLocaleString("uk-UA")}`}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
