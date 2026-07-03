"use client";

import { useEffect, useState } from "react";

export default function StaffTab({ enterpriseId }: { enterpriseId: string }) {
  const [employees, setEmployees] = useState<{
    id: string; name: string; profession: string; salary: number; mood: number;
    efficiency: number; baseEfficiency: number; qualificationLevel: number; isOnStrike: boolean;
    activeTraining: { targetLevel: number; ticksRemaining: number; ticksRequired: number } | null;
  }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [training, setTraining] = useState<string | null>(null);
  const [msgs,     setMsgs]     = useState<Record<string, string>>({});

  const load = () => {
    fetch(`/api/enterprises/${enterpriseId}/employees`)
      .then(r => r.json())
      .then(d => setEmployees(d.employees ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const TRAINING_COST: Record<number, number> = { 1: 8_000, 2: 12_000, 3: 18_000, 4: 24_000, 5: 35_000 };
  const moodColor = (m: number) => m < 0.3 ? "text-red-400" : m < 0.6 ? "text-amber-400" : "text-emerald-400";

  if (loading) return <p className="text-gray-500 text-sm">Завантаження...</p>;
  if (employees.length === 0) return <p className="text-gray-500 text-sm">Немає найнятих працівників.</p>;

  return (
    <div className="space-y-3">
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
