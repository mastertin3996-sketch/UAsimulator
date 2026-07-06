"use client";

import { useEffect, useState } from "react";

export default function MachineryTab({ enterpriseId }: { enterpriseId: string }) {
  const [data,    setData]    = useState<{ machinery: any[]; catalog: any[] } | null>(null);
  const [acting,  setActing]  = useState<string | null>(null);
  const [msg,     setMsg]     = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/enterprises/${enterpriseId}/machinery`)
      .then(r => r.json()).then(setData)
      .catch(err => { console.error("MachineryTab: fetch failed", err); setLoadError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [enterpriseId]);

  const act = async (action: string, payload: object) => {
    setActing(action);
    const res  = await fetch(`/api/enterprises/${enterpriseId}/machinery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const d = await res.json();
    setMsg(res.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (res.ok) load();
    setActing(null);
  };

  const durColor = (d: number) => d > 0.6 ? "text-emerald-400" : d > 0.3 ? "text-amber-400" : "text-red-400";

  const MACHINERY_BONUS: Record<string, number> = {
    TRACTOR: 20, COMBINE_HARVESTER: 30, SEEDER: 10, SPRAYER: 5,
  };
  const MACHINERY_EMOJI: Record<string, string> = {
    TRACTOR: "🚜", COMBINE_HARVESTER: "🌾", SEEDER: "🌱", SPRAYER: "💧",
  };

  const activeMachinery = (data?.machinery ?? []).filter((m: any) => m.isOperational && m.durability > 0);
  const totalBonus = activeMachinery.reduce((sum: number, m: any) => sum + (MACHINERY_BONUS[m.type] ?? 0), 0);

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400 flex items-center justify-between gap-2">
          <span>⚠ Не вдалося завантажити дані про техніку.</span>
          <button onClick={load} className="underline hover:text-red-300 shrink-0">Повторити</button>
        </div>
      )}
      {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}

      {/* Production impact summary */}
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Вплив на виробництво</p>
          <span className={`text-sm font-bold ${totalBonus > 0 ? "text-emerald-400" : "text-gray-500"}`}>
            {totalBonus > 0 ? `+${totalBonus}% врожайність` : "Немає активної техніки"}
          </span>
        </div>
        {activeMachinery.length > 0 ? (
          <div className="space-y-1">
            {activeMachinery.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{MACHINERY_EMOJI[m.type] ?? "⚙️"} {m.name}</span>
                <span className="text-emerald-400 font-medium">+{MACHINERY_BONUS[m.type] ?? 0}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Придбайте або орендуйте техніку щоб збільшити врожайність усіх цехів.</p>
        )}
        <p className="text-xs text-gray-600 mt-2">Застосовується до всіх агро-цехів підприємства кожен тік.</p>
      </div>

      {/* Existing machinery */}
      {data?.machinery && data.machinery.length > 0 && (
        <div className="space-y-2">
          {data.machinery.map((m: any) => (
            <div key={m.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{MACHINERY_EMOJI[m.type] ?? "⚙️"} {m.name}</p>
                  {m.isRented && <span className="text-xs bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">ОРЕНДА</span>}
                  {!m.isOperational && <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">ЗЛАМАНА</span>}
                  {m.isOperational && m.durability > 0 && (
                    <span className="text-xs bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded">+{MACHINERY_BONUS[m.type] ?? 0}% врожаю</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-700">
                    <div className={`h-full rounded-full ${durColor(m.durability)}`} style={{ width: `${m.durability * 100}%`, backgroundColor: "currentColor" }} />
                  </div>
                  <span className={`text-xs ${durColor(m.durability)}`}>{Math.round(m.durability * 100)}%</span>
                </div>
              </div>
              {(m.durability < 0.5 || !m.isOperational) && (
                <button onClick={() => act("repair", { machineryId: m.id })} disabled={acting === "repair"}
                  className="shrink-0 text-xs rounded-lg bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 transition-colors">
                  🔧 Ремонт
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Catalog */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Придбати / Орендувати техніку</p>
        <div className="space-y-2">
          {data?.catalog?.map((item: any) => (
            <div key={item.type} className="flex items-center gap-3 rounded-lg bg-gray-800 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{MACHINERY_EMOJI[item.type] ?? "⚙️"} {item.nameUa}</p>
                <p className="text-xs text-gray-500">
                  Купити: ₴{item.price.toLocaleString("uk-UA")} · Оренда: ₴{item.rentPerTick.toLocaleString("uk-UA")}/тік
                  <span className="ml-1 text-emerald-500">· +{Math.round(item.yieldBonus * 100)}% врожаю всіх цехів</span>
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => act(item.type, { machineryType: item.type })} disabled={!!acting}
                  className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 transition-colors">Купити</button>
                <button onClick={() => act(item.type + "_rent", { machineryType: item.type, isRent: true })} disabled={!!acting}
                  className="text-xs rounded bg-amber-700 hover:bg-amber-600 text-white px-2 py-1 transition-colors">Оренда</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
