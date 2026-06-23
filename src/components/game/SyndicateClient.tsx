"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Loader2, AlertCircle, Plus, LogOut, Crown, Shield, User, Globe, Lock, Landmark } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface SyndicateInfo {
  id: string; name: string; description: string | null; leaderId: string;
  leaderName: string; leaderCompany: string; memberCount: number;
  maxMembers: number; isPublic: boolean; treasury: number; createdAt: string;
}
interface MySyndicate extends SyndicateInfo {
  role: string; isLeader: boolean;
  members: { id: string; username: string; companyName: string; netWorth: number; role: string }[];
}

const ROLE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  LEADER:  Crown,
  OFFICER: Shield,
  MEMBER:  User,
};
const ROLE_UA: Record<string, string> = { LEADER: "Лідер", OFFICER: "Офіцер", MEMBER: "Член" };

export default function SyndicateClient() {
  const [syndicates, setSyndicates]   = useState<SyndicateInfo[]>([]);
  const [mySyndicate, setMySyndicate] = useState<MySyndicate | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [showCreate, setShowCreate]   = useState(false);
  const [joining, setJoining]         = useState<string | null>(null);
  const [leaving, setLeaving]         = useState(false);

  // Create form
  const [createName, setCreateName]   = useState("");
  const [createDesc, setCreateDesc]   = useState("");
  const [createPub,  setCreatePub]    = useState(true);
  const [creating,   setCreating]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/syndicate");
      const d = await r.json();
      setSyndicates(d.syndicates ?? []);
      setMySyndicate(d.mySyndicate ?? null);
    } catch { setError("Помилка завантаження"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createSyndicate() {
    if (!createName.trim()) return;
    setCreating(true);
    const r = await fetch("/api/syndicate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || null, isPublic: createPub }),
    });
    setCreating(false);
    if (r.ok) { setShowCreate(false); setCreateName(""); setCreateDesc(""); load(); }
    else { const d = await r.json(); alert(d.error); }
  }

  async function joinSyndicate(id: string) {
    setJoining(id);
    const r = await fetch("/api/syndicate/join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syndicateId: id }),
    });
    setJoining(null);
    if (r.ok) load(); else { const d = await r.json(); alert(d.error); }
  }

  async function leaveSyndicate() {
    if (!confirm("Покинути синдикат?")) return;
    setLeaving(true);
    const r = await fetch("/api/syndicate/leave", { method: "POST" });
    setLeaving(false);
    if (r.ok) load(); else { const d = await r.json(); alert(d.error); }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-gray-500" size={32} />
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh] gap-2 text-red-400">
      <AlertCircle size={20} /> {error}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-950 flex items-center justify-center">
            <Users size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Синдикат</h1>
            <p className="text-xs text-gray-500">Об'єднання гравців для спільних цілей</p>
          </div>
        </div>
        {!mySyndicate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Створити
          </button>
        )}
      </div>

      {/* My syndicate */}
      {mySyndicate && (
        <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-amber-400" />
              <span className="text-sm font-bold text-white">{mySyndicate.name}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                mySyndicate.isLeader ? "bg-amber-950 text-amber-400" : "bg-blue-950 text-blue-400"
              )}>
                {ROLE_UA[mySyndicate.role] ?? mySyndicate.role}
              </span>
            </div>
            <button
              onClick={leaveSyndicate} disabled={leaving}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              {leaving ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              {mySyndicate.isLeader && mySyndicate.members.length === 1 ? "Розпустити" : "Покинути"}
            </button>
          </div>

          {mySyndicate.description && (
            <p className="px-4 py-2 text-xs text-gray-400 border-b border-blue-900/30">{mySyndicate.description}</p>
          )}

          <div className="px-4 py-3 flex items-center gap-6 text-sm border-b border-blue-900/30">
            <div><p className="text-xs text-gray-500">Членів</p><p className="font-bold text-white">{mySyndicate.members.length}/{mySyndicate.maxMembers}</p></div>
            <div><p className="text-xs text-gray-500">Казна</p><p className="font-bold text-white">₴{formatNumber(Math.round(mySyndicate.treasury))}</p></div>
          </div>

          <div className="divide-y divide-blue-900/30">
            {mySyndicate.members.map((m) => {
              const RoleIcon = ROLE_ICONS[m.role] ?? User;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <RoleIcon size={14} className={m.role === "LEADER" ? "text-amber-400" : m.role === "OFFICER" ? "text-blue-400" : "text-gray-500"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{m.username}</p>
                    <p className="text-[11px] text-gray-500 truncate">{m.companyName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Капітал</p>
                    <p className="text-sm font-bold text-white">₴{formatNumber(Math.round(m.netWorth))}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && !mySyndicate && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-4">
          <p className="text-sm font-bold text-white">Новий синдикат</p>
          <div className="space-y-3">
            <input
              type="text" placeholder="Назва (3–40 символів)" value={createName}
              onChange={(e) => setCreateName(e.target.value)} maxLength={40}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <textarea
              placeholder="Опис (необов'язково)" value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreatePub(!createPub)}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  createPub ? "border-blue-700 bg-blue-950 text-blue-400" : "border-gray-700 bg-gray-800 text-gray-400"
                )}
              >
                {createPub ? <Globe size={12} /> : <Lock size={12} />}
                {createPub ? "Відкритий" : "Закритий"}
              </button>
              <p className="text-[10px] text-gray-600">{createPub ? "Будь-хто може приєднатися" : "Тільки за запрошенням"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">
              Скасувати
            </button>
            <button
              onClick={createSyndicate} disabled={creating || createName.trim().length < 3}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Створити
            </button>
          </div>
        </div>
      )}

      {/* Syndicate list */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-sm font-semibold text-white">Всі синдикати ({syndicates.length})</p>
        </div>
        {syndicates.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">Синдикатів ще немає. Будь першим!</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {syndicates.map((s) => {
              const isMine = mySyndicate?.id === s.id;
              const full   = s.memberCount >= s.maxMembers;
              return (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-800/30 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                    <Landmark size={16} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                      {!s.isPublic && <Lock size={10} className="text-gray-600 shrink-0" />}
                      {isMine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400">Мій</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{s.description ?? `Лідер: ${s.leaderName}`}</p>
                  </div>
                  <div className="text-center shrink-0 w-16">
                    <p className="text-xs font-bold text-white">{s.memberCount}/{s.maxMembers}</p>
                    <p className="text-[10px] text-gray-500">членів</p>
                  </div>
                  {!mySyndicate && (
                    <button
                      onClick={() => joinSyndicate(s.id)}
                      disabled={joining === s.id || full || !s.isPublic}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        full || !s.isPublic
                          ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white"
                      )}
                    >
                      {joining === s.id ? <Loader2 size={12} className="animate-spin" /> : full ? "Повний" : !s.isPublic ? "Закритий" : "Вступити"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
