"use client";

import { useEffect, useState } from "react";

interface LivestockEmployee { profession: string }

export default function LivestockTab({ enterpriseId, employees }: { enterpriseId: string; employees: LivestockEmployee[] }) {
  const [data,          setData]          = useState<{ herds: any[]; catalog: any[] } | null>(null);
  const [counts,        setCounts]        = useState<Record<string, string>>({});
  const [slaughterQty,  setSlaughterQty]  = useState<Record<string, string>>({});
  const [acting,        setActing]        = useState<string | null>(null);
  const [msgs,          setMsgs]          = useState<Record<string, string>>({});
  const [loading,       setLoading]       = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/enterprises/${enterpriseId}/livestock`)
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [enterpriseId]);

  const buy = async (species: string) => {
    const n = parseInt(counts[species] || "10");
    if (!n || n < 1) return;
    setActing(species);
    const res  = await fetch(`/api/enterprises/${enterpriseId}/livestock`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ species, headCount: n }),
    });
    const d = await res.json();
    setMsgs(prev => ({ ...prev, [species]: res.ok ? `✓ ${d.message}` : `✗ ${d.error}` }));
    if (res.ok) load();
    setActing(null);
  };

  const slaughter = async (herdId: string, species: string, count: number) => {
    if (!confirm(`Відправити ${count} гол. на забій?`)) return;
    setActing(herdId);
    const res = await fetch('/api/agro/slaughter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enterpriseId, herdId, count }),
    });
    const d = await res.json();
    if (res.ok) {
      const byproductStr = d.byproducts?.map((b: any) => `${b.nameUa}: ${b.qty.toFixed(1)} кг`).join(', ') ?? '';
      setMsgs(prev => ({ ...prev, [herdId]: `✓ ${d.message}${byproductStr ? ' | ' + byproductStr : ''}` }));
    } else {
      setMsgs(prev => ({ ...prev, [herdId]: `✗ ${d.error}` }));
    }
    setActing(null);
    // Refresh herds
    fetch(`/api/enterprises/${enterpriseId}/livestock`).then(r => r.json()).then(d => setData(d));
  };

  const healthColor = (h: number) => h > 0.7 ? "text-emerald-400" : h > 0.4 ? "text-amber-400" : "text-red-400";
  const SPECIES_UA: Record<string, string> = { CATTLE: "🐄 ВРХ", PIGS: "🐷 Свині", POULTRY: "🐔 Птиця" };
  const AGE_MIN: Record<string, number> = { POULTRY: 60, CATTLE: 500, PIGS: 195 };

  // Employee counts for milking section
  const milkmaids    = employees.filter(e => e.profession === 'MILKMAID').length;
  const milkingOps   = employees.filter(e => e.profession === 'MILKING_OPERATOR').length;

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;

  return (
    <div className="space-y-4">
      {/* Active herds */}
      {data?.herds && data.herds.length > 0 && (
        <div className="space-y-2">
          {data.herds.map((h: any) => {
            const slaughterCount = parseInt(slaughterQty[h.id] || "1");
            const ageLabel = h.ageInTicks < (AGE_MIN[h.species] ?? 0)
              ? <span className="text-amber-400 text-[9px]">⏳ До зрілості: {(AGE_MIN[h.species] ?? 0) - h.ageInTicks} д.</span>
              : <span className="text-emerald-400 text-[9px]">✓ Зрілі</span>;
            return (
              <div key={h.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{SPECIES_UA[h.species] ?? h.species} — {h.headCount} голів</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {ageLabel}
                    </div>
                    <p className={`text-xs ${healthColor(h.health)}`}>Здоров&apos;я: {Math.round(h.health * 100)}% · Вік: {h.ageInTicks} тік(ів)
                      {h.feedSkippedTicks > 0 && <span className="ml-2 text-red-400">⚠ {h.feedSkippedTicks} тіки без корму</span>}
                    </p>
                    {h.species === 'CATTLE' && (
                      <p className="text-[9px] text-blue-300">
                        🥛 Доїння: {milkmaids > 0 ? `${milkmaids} доярка (до ${milkmaids * 250} л/д)` : 'немає доярки'}
                        {milkingOps > 0 ? ` | Апарат: ${milkingOps} оп. (до ${milkingOps * 2400} л/д)` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={1} max={h.headCount}
                        value={slaughterQty[h.id] ?? "1"}
                        onChange={e => setSlaughterQty(prev => ({ ...prev, [h.id]: e.target.value }))}
                        className="w-14 rounded bg-gray-800 border border-gray-700 px-1 py-0.5 text-xs text-white text-center"
                      />
                      <button onClick={() => slaughter(h.id, h.species, slaughterCount)} disabled={acting === h.id}
                        className="text-xs rounded bg-red-900/50 hover:bg-red-900/70 border border-red-700/30 text-red-400 px-2 py-1 transition-colors">
                        {acting === h.id ? "..." : "Забій"}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{h.config?.outputDesc}</p>
                {msgs[h.id] && <p className={`text-[10px] ${msgs[h.id].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msgs[h.id]}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Slaughter requirements info */}
      <div className="bg-gray-900 rounded-lg p-2">
        <p className="text-[9px] text-gray-400 font-semibold mb-1">Вимоги для забою:</p>
        <table className="text-[9px] w-full">
          <tbody>
            <tr><td className="text-gray-400 pr-2">🐔 Птиця</td><td>EQ-SLAUGHTER_POULTRY + Обвалювальник + Технік</td><td className="text-right text-gray-500">до 200 гол/д</td></tr>
            <tr><td className="text-gray-400 pr-2">🐷 Свині</td><td>EQ-SLAUGHTER_PIGS + Обвалювальник + Технік</td><td className="text-right text-gray-500">до 6 гол/д</td></tr>
            <tr><td className="text-gray-400 pr-2">🐄 ВРХ</td><td>EQ-SLAUGHTER_CATTLE + Обвалювальник + Технік + Слюсар</td><td className="text-right text-gray-500">до 15 гол/д</td></tr>
          </tbody>
        </table>
      </div>

      {/* Buy catalog */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Закупити худобу</p>
        <p className="text-xs text-gray-500">Корм: RM-CORN зі складу. Потрібен AGRO_PERMIT.</p>
        {data?.catalog?.map((item: any) => (
          <div key={item.species} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white">{SPECIES_UA[item.species] ?? item.species}</p>
                <p className="text-xs text-gray-500">₴{item.pricePerHead.toLocaleString("uk-UA")}/голову · {item.outputDesc}</p>
              </div>
              <div className="flex gap-1.5 items-center shrink-0">
                <input type="number" min={1} value={counts[item.species] ?? "10"}
                  onChange={e => setCounts(prev => ({ ...prev, [item.species]: e.target.value }))}
                  className="w-16 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white text-center" />
                <button onClick={() => buy(item.species)} disabled={acting === item.species}
                  className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 transition-colors">
                  {acting === item.species ? "..." : "Купити"}
                </button>
              </div>
            </div>
            {msgs[item.species] && <p className={`text-xs ${msgs[item.species].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msgs[item.species]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
