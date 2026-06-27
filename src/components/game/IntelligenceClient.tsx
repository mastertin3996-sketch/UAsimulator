"use client";

import { useEffect, useState } from "react";

interface Target { id: string; username: string; companyName: string }
interface EnterpriseIntel { name: string; type: string; prices: { sku: string; name: string; price: number }[]; inventory: { sku: string; name: string; qty: number }[] }
interface Report {
  id: string; targetName: string; targetUser: string; success: boolean; detected: boolean;
  createdAt: string;
  result: { enterprises: EnterpriseIntel[]; reputation?: number; credit?: number } | null;
}

export function IntelligenceClient() {
  const [targets,   setTargets]   = useState<Target[]>([]);
  const [reports,   setReports]   = useState<Report[]>([]);
  const [selected,  setSelected]  = useState("");
  const [loading,   setLoading]   = useState(true);
  const [spying,    setSpying]    = useState(false);
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/intelligence");
    const data = await res.json();
    setTargets(data.targets ?? []);
    setReports(data.reports ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const spy = async () => {
    if (!selected || !confirm(`Провести розвідку за ₴15 000? Є ризик виявлення якщо у конкурента є охорона.`)) return;
    setSpying(true);
    const res  = await fetch("/api/intelligence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ targetId: selected }),
    });
    const data = await res.json();
    if (res.ok) { load(); }
    else alert(`✗ ${data.error}`);
    setSpying(false);
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Конкурентна розвідка</h1>
        <p className="text-sm text-gray-400 mt-1">
          Отримайте дані про ціни та запаси конкурента за ₴15 000. Якщо у нього є охорона — є ризик виявлення.
        </p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Нова розвідка</p>
        <div className="flex gap-3">
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white">
            <option value="">— оберіть конкурента —</option>
            {targets.map(t => <option key={t.id} value={t.id}>{t.companyName} ({t.username})</option>)}
          </select>
          <button onClick={spy} disabled={!selected || spying}
            className="shrink-0 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium px-4 py-2 transition-colors">
            {spying ? "..." : "🔍 Розвідати (₴15 000)"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Завантаження...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-600 text-sm">Ще немає звітів розвідки.</p>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/40"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span className={`text-lg ${r.success ? "text-emerald-400" : "text-red-400"}`}>
                  {r.success ? "✅" : "❌"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{r.targetName}</p>
                  <p className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString("uk-UA")}
                    {r.detected && <span className="ml-2 text-amber-400">⚠ виявлено</span>}
                    {!r.success && <span className="ml-2 text-red-400">Провал — охорона</span>}
                  </p>
                </div>
                <span className="text-gray-600 text-xs">{expanded === r.id ? "▲" : "▼"}</span>
              </div>

              {expanded === r.id && r.success && r.result && (
                <div className="border-t border-gray-800 px-4 py-3 space-y-3">
                  {r.result.reputation !== undefined && (
                    <p className="text-xs text-gray-400">Репутація: {r.result.reputation.toFixed(1)} · Кредитний рейтинг: {r.result.credit}</p>
                  )}
                  {r.result.enterprises.map((e, ei) => (
                    <div key={ei} className="space-y-1">
                      <p className="text-xs font-semibold text-gray-300">{e.name} ({e.type})</p>
                      {e.prices.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {e.prices.map((p, pi) => (
                            <span key={pi} className="text-[10px] bg-blue-950/50 border border-blue-800/30 rounded px-1.5 py-0.5 text-blue-300">
                              {p.sku} ₴{p.price.toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
                      {e.inventory.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {e.inventory.map((i, ii) => (
                            <span key={ii} className="text-[10px] bg-gray-800 rounded px-1.5 py-0.5 text-gray-400">
                              {i.sku} {i.qty.toFixed(0)} од.
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
