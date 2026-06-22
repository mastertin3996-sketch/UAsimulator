"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Ban, Gift, Trash2, CheckCircle, AlertTriangle } from "lucide-react";

interface AdminUser {
  id: string; email: string; username: string; level: number;
  isActive: boolean; isFlagged: boolean; role: string;
  gcBalance: number; pcBalance: number;
  createdAt: string; lastLoginAt: string | null;
  companyName: string | null; enterpriseCount: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function UsersTab() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoad]    = useState(false);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [bonusTarget, setBonusTarget] = useState<AdminUser | null>(null);
  const [bonusAmt, setBonusAmt]       = useState("");
  const [bonusCur, setBonusCur]       = useState<"GC" | "PC">("GC");
  const [bonusReason, setBonusReason] = useState("");
  const [busyId, setBusyId]   = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = useCallback(async (q: string) => {
    setLoad(true);
    try {
      const r = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}`);
      if (r.ok) { const d = await r.json(); setUsers(d.users); }
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { loadUsers(""); }, [loadUsers]);

  const handleSearch = (v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadUsers(v), 350);
  };

  const act = async (url: string, body?: object) => {
    const r = await fetch(url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : body ? JSON.stringify(body) : undefined,
    });
    return r;
  };

  const handleBan = async (u: AdminUser) => {
    setBusyId(u.id);
    try {
      const r = await act(`/api/admin/users/${u.id}/ban`);
      const d = await r.json();
      if (r.ok) {
        showToast(d.isActive ? `${u.username} розблоковано` : `${u.username} заблоковано`, true);
        loadUsers(search);
      } else { showToast(d.error, false); }
    } finally { setBusyId(null); }
  };

  const handleReset = async (u: AdminUser) => {
    if (!confirm(`Обнулити баланс ${u.username}? GC: ${fmt(u.gcBalance)}, PC: ${fmt(u.pcBalance)}`)) return;
    setBusyId(u.id);
    try {
      const r = await act(`/api/admin/users/${u.id}/reset-balance`);
      if (r.ok) { showToast(`Баланс ${u.username} обнулено`, true); loadUsers(search); }
      else { const d = await r.json(); showToast(d.error, false); }
    } finally { setBusyId(null); }
  };

  const handleBonus = async () => {
    if (!bonusTarget || !bonusAmt || !bonusReason.trim()) return;
    setBusyId(bonusTarget.id);
    try {
      const r = await act(`/api/admin/users/${bonusTarget.id}/bonus`, {
        amount: parseFloat(bonusAmt), currency: bonusCur, reason: bonusReason,
      });
      const d = await r.json();
      if (r.ok) {
        showToast(`Нараховано ${fmt(parseFloat(bonusAmt))} ${bonusCur} для ${bonusTarget.username}`, true);
        setBonusTarget(null); setBonusAmt(""); setBonusReason("");
        loadUsers(search);
      } else { showToast(d.error, false); }
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => handleSearch(e.target.value)}
          placeholder="Пошук за email або username..."
          className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Гравець", "Компанія", "Рівень", "GC", "PC", "Статус", "Дії"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">Завантаження...</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">Гравців не знайдено</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${
                  !u.isActive ? "opacity-50" : ""
                }`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.isFlagged && <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-white">{u.username}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-300">{u.companyName ?? <span className="text-gray-600">—</span>}</p>
                    {u.enterpriseCount > 0 && (
                      <p className="text-xs text-gray-500">{u.enterpriseCount} підпр.</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u.level}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400">{fmt(u.gcBalance)}</td>
                  <td className="px-4 py-3 font-mono text-blue-400">{fmt(u.pcBalance)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === "ADMIN"
                        ? "bg-purple-900 text-purple-300"
                        : !u.isActive
                        ? "bg-red-950 text-red-400"
                        : u.isFlagged
                        ? "bg-amber-950 text-amber-400"
                        : "bg-emerald-950 text-emerald-400"
                    }`}>
                      {u.role === "ADMIN" ? "ADMIN" : !u.isActive ? "Заблокован" : u.isFlagged ? "Підозр." : "Активний"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button title={u.isActive ? "Заблокувати" : "Розблокувати"}
                        onClick={() => handleBan(u)}
                        disabled={busyId === u.id || u.role === "ADMIN"}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                          u.isActive
                            ? "text-red-400 hover:bg-red-950"
                            : "text-emerald-400 hover:bg-emerald-950"
                        }`}>
                        {u.isActive ? <Ban size={15} /> : <CheckCircle size={15} />}
                      </button>
                      <button title="Нарахувати бонус" onClick={() => setBonusTarget(u)}
                        disabled={busyId === u.id}
                        className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-950 transition-colors disabled:opacity-40">
                        <Gift size={15} />
                      </button>
                      <button title="Обнулити баланс" onClick={() => handleReset(u)}
                        disabled={busyId === u.id || u.role === "ADMIN"}
                        className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-950 transition-colors disabled:opacity-40">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bonus modal */}
      {bonusTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setBonusTarget(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">Нарахувати бонус</h3>
            <p className="text-sm text-gray-500 mb-4">Гравець: <span className="text-white">{bonusTarget.username}</span></p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {(["GC", "PC"] as const).map((c) => (
                <button key={c} onClick={() => setBonusCur(c)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                    bonusCur === c
                      ? c === "GC" ? "bg-emerald-900 border-emerald-600 text-emerald-300" : "bg-blue-900 border-blue-600 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-500"
                  }`}>
                  {c === "GC" ? "GameCash" : "PremiumCoin"}
                </button>
              ))}
            </div>

            <input type="number" value={bonusAmt} onChange={(e) => setBonusAmt(e.target.value)}
              placeholder="Сума"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white mb-3 focus:outline-none focus:border-emerald-500" />
            <input type="text" value={bonusReason} onChange={(e) => setBonusReason(e.target.value)}
              placeholder="Причина нарахування"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white mb-4 focus:outline-none focus:border-emerald-500" />

            <div className="flex gap-2">
              <button onClick={() => setBonusTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors">
                Скасувати
              </button>
              <button onClick={handleBonus} disabled={!bonusAmt || !bonusReason.trim() || busyId === bonusTarget.id}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50">
                Нарахувати
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-xl z-50 ${
          toast.ok ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}
