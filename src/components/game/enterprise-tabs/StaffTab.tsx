"use client";

import { useEffect, useState } from "react";

export default function StaffTab({ enterpriseId }: { enterpriseId: string }) {
  const [employees, setEmployees] = useState<{
    id: string; name: string; profession: string; salary: number; mood: number;
    efficiency: number; baseEfficiency: number; qualificationLevel: number; isOnStrike: boolean;
    workshopId: string | null; workshopName: string | null;
    activeTraining: { targetLevel: number; ticksRemaining: number; ticksRequired: number } | null;
  }[]>([]);
  const [workshops, setWorkshops] = useState<{ id: string; name: string }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [training, setTraining] = useState<string | null>(null);
  const [msgs,     setMsgs]     = useState<Record<string, string>>({});

  const load = () => {
    setLoadError(false);
    fetch(`/api/enterprises/${enterpriseId}/employees`)
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? []))
      .catch(err => { console.error("StaffTab: employees fetch failed", err); setLoadError(true); })
      .finally(() => setLoading(false));
    fetch(`/api/enterprises/${enterpriseId}`)
      .then(r => r.json())
      .then(d => setWorkshops((d.enterprise?.workshops ?? []).map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))))
      .catch(err => { console.error("StaffTab: enterprise fetch failed", err); setLoadError(true); });
  };
  useEffect(() => { load(); }, [enterpriseId]);

  const startTraining = async (empId: string) => {
    setTraining(empId);
    const res  = await fetch("/api/training", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ employeeId: empId }),
    });
    const data = await res.json();
    setMsgs(prev => ({ ...prev, [empId]: res.ok ? `✓ ${data.message}` : `✗ ${data.error}` }));
    if (res.ok) load();
    setTraining(null);
  };

  const reassign = async (empId: string, workshopId: string | null) => {
    await fetch(`/api/enterprises/${enterpriseId}/employees/${empId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ workshopId }),
    });
    load();
  };

  const TRAINING_COST: Record<number, number> = { 1: 8_000, 2: 12_000, 3: 18_000, 4: 24_000, 5: 35_000 };
  const moodColor = (m: number) => m < 0.3 ? "text-red-400" : m < 0.6 ? "text-amber-400" : "text-emerald-400";

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;
  if (loadError && employees.length === 0) {
    return (
      <div className="rounded-lg border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400 flex items-center justify-between gap-2">
        <span>⚠ Не вдалося завантажити дані про персонал.</span>
        <button onClick={load} className="underline hover:text-red-300 shrink-0">Повторити</button>
      </div>
    );
  }
  if (employees.length === 0) return <p className="text-gray-500 text-sm">Немає найнятих працівників.</p>;

  const unassignedCount = employees.filter(e => !e.workshopId).length;

  return (
    <div className="space-y-3">
      {loadError && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400 flex items-center justify-between gap-2">
          <span>⚠ Останнє оновлення не вдалося — дані можуть бути застарілими.</span>
          <button onClick={load} className="underline hover:text-red-300 shrink-0">Повторити</button>
        </div>
      )}
      {unassignedCount > 0 && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
          Неприкріплені ({unassignedCount}) — не впливають на виробництво жодного цеху
        </div>
      )}

      {employees.map(e => (
        <div key={e.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-white text-sm">{e.name}</p>
              <p className="text-xs text-gray-500">{e.profession} · ₴{e.salary.toLocaleString("uk-UA")}/міс</p>
            </div>
            <div className="flex items-center gap-2">
              {e.isOnStrike && <span className="text-xs bg-red-950 text-red-400 px-1.5 py-0.5 rounded-full">СТРАЙК</span>}
              <span className="text-xs bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded-full">Кваліфікація {e.qualificationLevel}/5</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Настрій</p>
              <p className={`font-semibold ${moodColor(e.mood)}`}>{(e.mood * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Ефективність</p>
              <p className="font-semibold text-white">{(e.efficiency * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Базова eff.</p>
              <p className="font-semibold text-white">{(e.baseEfficiency * 100).toFixed(0)}%</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Цех</p>
            <select
              value={e.workshopId ?? ""}
              onChange={ev => reassign(e.id, ev.target.value || null)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs bg-gray-800 focus:outline-none focus:border-emerald-500 ${e.workshopId ? "border-gray-700 text-white" : "border-amber-700/50 text-amber-400"}`}
            >
              <option value="">— без цеху —</option>
              {workshops.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          {e.activeTraining ? (
            <div className="rounded-lg bg-blue-950/30 border border-blue-800/30 px-3 py-2 text-xs text-blue-300">
              Навчання до рівня {e.activeTraining.targetLevel} — залишилось {e.activeTraining.ticksRemaining} тік(ів)
            </div>
          ) : e.qualificationLevel < 5 ? (
            <div>
              <button onClick={() => startTraining(e.id)} disabled={training === e.id}
                className="w-full rounded-lg bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs py-2 font-medium transition-colors">
                {training === e.id ? "..." : `📚 Навчання → рівень ${e.qualificationLevel + 1} (₴${TRAINING_COST[e.qualificationLevel + 1]?.toLocaleString("uk-UA")})`}
              </button>
              {msgs[e.id] && <p className={`text-xs mt-1 ${msgs[e.id].startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msgs[e.id]}</p>}
            </div>
          ) : (
            <p className="text-xs text-emerald-400 text-center">🏆 Максимальний рівень кваліфікації</p>
          )}
        </div>
      ))}
    </div>
  );
}
