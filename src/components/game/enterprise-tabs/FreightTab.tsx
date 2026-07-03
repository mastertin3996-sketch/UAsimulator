"use client";

import { useEffect, useState } from "react";

export default function FreightTab({ enterpriseId }: { enterpriseId: string }) {
  void enterpriseId;
  const [info, setInfo] = useState<{
    hasHub: boolean;
    openOrders: { id: string; productSku: string; quantityUnits: number; fromCity: string; toCity: string; totalValueUah: number; status: string }[];
    myOrders:   { id: string; productSku: string; fromCity: string; toCity: string; totalValueUah: number; status: string }[];
  } | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/logistics/freight")
      .then(r => r.ok ? r.json() : null).then(setInfo).catch(() => {});
  }, []);

  const accept = async (orderId: string) => {
    setAccepting(orderId); setMsg(null);
    const r = await fetch("/api/logistics/freight", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    setAccepting(null);
    if (r.ok) fetch("/api/logistics/freight").then(res => res.ok ? res.json() : null).then(setInfo).catch(() => {});
  };

  if (!info) return <p className="text-xs text-gray-500 p-2">Завантаження...</p>;
  return (
    <div className="space-y-4 p-1">
      {!info.hasHub && <div className="text-xs text-amber-400 border border-amber-900/40 rounded-lg p-3">Потрібен активний LOGISTICS_HUB для прийняття замовлень</div>}
      {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
      <div className="rounded-lg border border-blue-900/40 bg-blue-950/10 p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-400">Відкриті замовлення ({info.openOrders.length})</p>
        {info.openOrders.length === 0 ? <p className="text-xs text-gray-600">Немає доступних замовлень</p> : (
          <div className="space-y-1.5">
            {info.openOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs border border-gray-800 rounded p-2 gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-emerald-300">{o.productSku}</span>
                  <span className="text-gray-400 ml-2">{o.quantityUnits} од.</span>
                  <span className="text-gray-600 ml-2">{o.fromCity} → {o.toCity}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-emerald-400 font-mono">₴{o.totalValueUah.toLocaleString()}</span>
                  <button onClick={() => accept(o.id)} disabled={!info.hasHub || accepting === o.id}
                    className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded">
                    {accepting === o.id ? "..." : "Взяти"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {info.myOrders.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-400">Мої замовлення</p>
          {info.myOrders.map(o => (
            <div key={o.id} className="flex items-center justify-between text-xs text-gray-500">
              <span>{o.productSku} {o.fromCity} → {o.toCity}</span>
              <span className={o.status === "COMPLETED" ? "text-emerald-400" : "text-amber-400"}>
                {o.status === "COMPLETED" ? `✓ ₴${o.totalValueUah.toLocaleString()}` : "У процесі..."}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
