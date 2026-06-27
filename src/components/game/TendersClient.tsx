"use client";

import { useEffect, useState } from "react";

interface Tender {
  id: string; title: string; sku: string; productName: string; unit: string;
  quantityRequired: number; pricePerUnit: number; expiresAtTick: number;
  ticksLeft: number; status: string;
}

interface Enterprise { id: string; name: string; type: string }

export function TendersClient() {
  const [tenders,     setTenders]     = useState<Tender[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [currentTick, setCurrentTick] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [fulfilling,  setFulfilling]  = useState<string | null>(null);
  const [selectedEnt, setSelectedEnt] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [tRes, eRes] = await Promise.all([
      fetch("/api/tenders"),
      fetch("/api/enterprises"),
    ]);
    const { tenders: t, currentTick: ct } = await tRes.json();
    const { enterprises: e } = await eRes.json();
    setTenders(t ?? []);
    setCurrentTick(ct ?? 0);
    setEnterprises((e ?? []).filter((ent: Enterprise) => !["OFFICE", "LOGISTICS_HUB"].includes(ent.type)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fulfill = async (tenderId: string) => {
    if (!selectedEnt) { alert("Оберіть підприємство для виконання тендеру"); return; }
    setFulfilling(tenderId);
    const res  = await fetch(`/api/tenders/${tenderId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ enterpriseId: selectedEnt }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✓ ${data.message}\nВиручка: ₴${Number(data.revenueUah ?? 0).toLocaleString("uk-UA")}`);
      load();
    } else {
      alert(`✗ ${data.error}`);
    }
    setFulfilling(null);
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Державні тендери</h1>
        <p className="text-sm text-gray-400 mt-1">
          Постачайте товари державі за ціною вище ринкової. Перший хто виконає — отримує оплату та статус акредитованого постачальника.
        </p>
      </div>

      {enterprises.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400 shrink-0">Виконати з:</label>
          <select
            value={selectedEnt}
            onChange={e => setSelectedEnt(e.target.value)}
            className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white"
          >
            <option value="">— оберіть підприємство —</option>
            {enterprises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Завантаження...</p>
      ) : tenders.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          Наразі немає відкритих тендерів. Наступний з&apos;явиться через кілька тіків.
        </div>
      ) : (
        <div className="space-y-3">
          {tenders.map(t => (
            <div key={t.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white leading-snug">{t.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{t.sku} · {t.productName}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  t.ticksLeft <= 3 ? "bg-red-950 text-red-400" : t.ticksLeft <= 7 ? "bg-amber-950 text-amber-400" : "bg-emerald-950 text-emerald-400"
                }`}>
                  {t.ticksLeft} тік{t.ticksLeft === 1 ? "" : "ів"} залишилось
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded bg-gray-800 px-2 py-1.5">
                  <p className="text-[10px] text-gray-500">Кількість</p>
                  <p className="text-sm font-mono font-semibold text-white">{t.quantityRequired} {t.unit}</p>
                </div>
                <div className="rounded bg-gray-800 px-2 py-1.5">
                  <p className="text-[10px] text-gray-500">Ціна/од.</p>
                  <p className="text-sm font-mono font-semibold text-emerald-400">₴{t.pricePerUnit.toFixed(2)}</p>
                </div>
                <div className="rounded bg-gray-800 px-2 py-1.5">
                  <p className="text-[10px] text-gray-500">Загалом</p>
                  <p className="text-sm font-mono font-semibold text-white">₴{(t.quantityRequired * t.pricePerUnit).toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</p>
                </div>
              </div>

              <button
                onClick={() => fulfill(t.id)}
                disabled={fulfilling === t.id || !selectedEnt}
                className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium py-2 transition-colors"
              >
                {fulfilling === t.id ? "Виконується..." : "Виконати тендер"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-600 text-center">Тік {currentTick} · Оновлюється кожні 15 тіків</p>
    </div>
  );
}
