"use client";

import { useEffect, useState } from "react";
import type { EnterpriseData } from "@/components/game/EnterpriseDetailClient";
import { formatUAH } from "@/lib/utils";

interface SecurityCatalogEntry {
  level: number; capexUah: number; deltaCapexUah: number; monthlyUpkeepUah: number; available: boolean;
}
interface SecurityData {
  current: { securityLevel: number; guardCount: number; monthlyUpkeepUah: number; isActive: boolean } | null;
  defenseScore: { totalDefenseScore: number };
  catalog: SecurityCatalogEntry[];
}

interface Patent {
  id: string; technologyCode: string; technologyName: string;
  licenseRoyaltyPct: number; registeredAtTick: string;
}
interface Lawsuit {
  id: string; technologyCode: string; status: string;
  defendantName?: string; plaintiffName?: string;
  benefitUah: number; penaltyUah: number; description: string;
}
interface PatentsData {
  patentFeeUah: number;
  patents: Patent[];
  registerable: { code: string; name: string }[];
  lawsuitsAsPlaintiff: Lawsuit[];
  lawsuitsAsDefendant: Lawsuit[];
}

interface Candidate { defendantId: string; name: string }

export default function PatentSecurityTab({ enterprise }: { enterprise: EnterpriseData }) {
  const [secData, setSecData]   = useState<SecurityData | null>(null);
  const [secLoading, setSecLoading] = useState(true);
  const [secError, setSecError] = useState(false);
  const [installingLevel, setInstallingLevel] = useState<number | null>(null);

  const [patData, setPatData]   = useState<PatentsData | null>(null);
  const [patLoading, setPatLoading] = useState(true);
  const [patError, setPatError] = useState(false);
  const [selectedTech, setSelectedTech] = useState("");
  const [registering, setRegistering] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [lawsuitPatentId, setLawsuitPatentId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedDefendant, setSelectedDefendant] = useState("");
  const [filing, setFiling] = useState(false);

  const loadSecurity = () => {
    setSecLoading(true);
    setSecError(false);
    fetch(`/api/enterprises/${enterprise.id}/security-system`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("bad status")))
      .then(d => setSecData(d))
      .catch(err => { console.error("PatentSecurityTab: security fetch failed", err); setSecError(true); })
      .finally(() => setSecLoading(false));
  };

  const loadPatents = () => {
    setPatLoading(true);
    setPatError(false);
    fetch("/api/patents")
      .then(r => r.ok ? r.json() : Promise.reject(new Error("bad status")))
      .then(d => setPatData(d))
      .catch(err => { console.error("PatentSecurityTab: patents fetch failed", err); setPatError(true); })
      .finally(() => setPatLoading(false));
  };

  useEffect(() => { loadSecurity(); loadPatents(); }, [enterprise.id]);

  async function handleInstall(level: number) {
    setInstallingLevel(level);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/enterprises/${enterprise.id}/security-system`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const d = await res.json();
      if (!res.ok) { setActionMsg(d.error ?? "Помилка встановлення системи безпеки"); return; }
      setActionMsg(`Систему безпеки рівня ${d.level} встановлено (CAPEX ${formatUAH(d.capexUah)}).`);
      loadSecurity();
    } catch (err) {
      console.error("PatentSecurityTab: install failed", err);
      setActionMsg("Мережева помилка при встановленні системи безпеки");
    } finally {
      setInstallingLevel(null);
    }
  }

  async function handleRegisterPatent() {
    if (!selectedTech) return;
    setRegistering(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/patents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technologyCode: selectedTech }),
      });
      const d = await res.json();
      if (!res.ok) { setActionMsg(d.error ?? "Помилка реєстрації патенту"); return; }
      setActionMsg(`Патент зареєстровано (мито ${formatUAH(d.feeUah)}).`);
      setSelectedTech("");
      loadPatents();
    } catch (err) {
      console.error("PatentSecurityTab: register patent failed", err);
      setActionMsg("Мережева помилка при реєстрації патенту");
    } finally {
      setRegistering(false);
    }
  }

  function openLawsuitPanel(patentId: string) {
    setLawsuitPatentId(lawsuitPatentId === patentId ? null : patentId);
    setSelectedDefendant("");
    if (lawsuitPatentId === patentId) return;
    setCandidatesLoading(true);
    fetch(`/api/patents/${patentId}/lawsuit`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("bad status")))
      .then(d => setCandidates(d.candidates ?? []))
      .catch(err => { console.error("PatentSecurityTab: candidates fetch failed", err); setCandidates([]); })
      .finally(() => setCandidatesLoading(false));
  }

  async function handleFileLawsuit(patentId: string) {
    if (!selectedDefendant) return;
    setFiling(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/patents/${patentId}/lawsuit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defendantId: selectedDefendant }),
      });
      const d = await res.json();
      if (!res.ok) { setActionMsg(d.error ?? "Помилка подачі позову"); return; }
      setActionMsg(d.outcome === "PLAINTIFF_WON" ? `Позов виграно: ${d.description}` : `Позов програно: ${d.description}`);
      setLawsuitPatentId(null);
      loadPatents();
    } catch (err) {
      console.error("PatentSecurityTab: file lawsuit failed", err);
      setActionMsg("Мережева помилка при подачі позову");
    } finally {
      setFiling(false);
    }
  }

  return (
    <div className="space-y-4 p-1">
      {actionMsg && (
        <div className="rounded-lg border border-blue-800/40 bg-blue-950/10 px-3 py-2 text-xs text-blue-300">
          {actionMsg}
        </div>
      )}

      {/* ── SecuritySystem ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Система безпеки</p>
        {secError && (
          <div className="rounded border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400 flex items-center justify-between gap-2">
            <span>⚠ Не вдалося завантажити дані безпеки.</span>
            <button onClick={loadSecurity} className="underline hover:text-red-300 shrink-0">Повторити</button>
          </div>
        )}
        {secLoading ? (
          <p className="text-xs text-gray-600">Завантаження...</p>
        ) : secData ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-gray-800 py-1.5">
                <p className="text-gray-500">Рівень</p>
                <p className="font-semibold text-white">{secData.current?.securityLevel ?? 0} / 5</p>
              </div>
              <div className="rounded bg-gray-800 py-1.5">
                <p className="text-gray-500">Охорона</p>
                <p className="font-semibold text-white">{secData.current?.guardCount ?? 0} осіб</p>
              </div>
              <div className="rounded bg-gray-800 py-1.5">
                <p className="text-gray-500">Defense Score</p>
                <p className="font-semibold text-emerald-400">{Math.round(secData.defenseScore.totalDefenseScore * 100)}%</p>
              </div>
            </div>
            {secData.current && (
              <p className="text-xs text-gray-600">Утримання: {formatUAH(secData.current.monthlyUpkeepUah)}/міс</p>
            )}
            <div className="grid grid-cols-5 gap-1.5">
              {secData.catalog.map(entry => (
                <button
                  key={entry.level}
                  disabled={!entry.available || installingLevel !== null}
                  onClick={() => handleInstall(entry.level)}
                  className={`rounded px-1.5 py-1.5 text-[11px] border transition-colors ${
                    !entry.available
                      ? "border-gray-800 bg-gray-800/50 text-gray-600 cursor-not-allowed"
                      : "border-emerald-800/40 bg-emerald-950/10 text-emerald-400 hover:bg-emerald-900/20"
                  }`}
                >
                  <div className="font-semibold">Рівень {entry.level}</div>
                  <div>{formatUAH(entry.deltaCapexUah)}</div>
                  {installingLevel === entry.level && <div>...</div>}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* ── Patents ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Патенти</p>
        {patError && (
          <div className="rounded border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400 flex items-center justify-between gap-2">
            <span>⚠ Не вдалося завантажити дані патентів.</span>
            <button onClick={loadPatents} className="underline hover:text-red-300 shrink-0">Повторити</button>
          </div>
        )}
        {patLoading ? (
          <p className="text-xs text-gray-600">Завантаження...</p>
        ) : patData ? (
          <>
            {patData.patents.length === 0 ? (
              <p className="text-xs text-gray-600">Немає зареєстрованих патентів.</p>
            ) : (
              <div className="space-y-1.5">
                {patData.patents.map(p => (
                  <div key={p.id} className="rounded bg-gray-800 px-2 py-1.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">{p.technologyName}</span>
                      <button
                        onClick={() => openLawsuitPanel(p.id)}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        {lawsuitPatentId === p.id ? "Сховати" : "Подати позов"}
                      </button>
                    </div>
                    {lawsuitPatentId === p.id && (
                      <div className="space-y-1.5 border-t border-gray-700 pt-1.5">
                        {candidatesLoading ? (
                          <p className="text-gray-600">Пошук порушників...</p>
                        ) : candidates.length === 0 ? (
                          <p className="text-gray-600">Немає гравців, що використовують цю технологію без патенту.</p>
                        ) : (
                          <>
                            <select
                              value={selectedDefendant}
                              onChange={e => setSelectedDefendant(e.target.value)}
                              className="w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-xs text-white"
                            >
                              <option value="">— оберіть відповідача —</option>
                              {candidates.map(c => (
                                <option key={c.defendantId} value={c.defendantId}>{c.name}</option>
                              ))}
                            </select>
                            <button
                              disabled={!selectedDefendant || filing}
                              onClick={() => handleFileLawsuit(p.id)}
                              className="w-full rounded bg-red-900/40 border border-red-800/40 text-red-300 py-1 disabled:opacity-40"
                            >
                              {filing ? "Подання..." : "Подати позов"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-800 pt-2 space-y-1.5">
              <p className="text-xs text-gray-500">Реєстрація нового патенту (мито {formatUAH(patData.patentFeeUah)})</p>
              {patData.registerable.length === 0 ? (
                <p className="text-xs text-gray-600">Немає розблокованих технологій, доступних для патентування.</p>
              ) : (
                <div className="flex gap-1.5">
                  <select
                    value={selectedTech}
                    onChange={e => setSelectedTech(e.target.value)}
                    className="flex-1 rounded bg-gray-900 border border-gray-700 px-2 py-1 text-xs text-white"
                  >
                    <option value="">— оберіть технологію —</option>
                    {patData.registerable.map(t => (
                      <option key={t.code} value={t.code}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    disabled={!selectedTech || registering}
                    onClick={handleRegisterPatent}
                    className="rounded bg-emerald-900/40 border border-emerald-800/40 text-emerald-300 px-3 py-1 text-xs disabled:opacity-40"
                  >
                    {registering ? "..." : "Зареєструвати"}
                  </button>
                </div>
              )}
            </div>

            {(patData.lawsuitsAsPlaintiff.length > 0 || patData.lawsuitsAsDefendant.length > 0) && (
              <div className="border-t border-gray-800 pt-2 space-y-1">
                <p className="text-xs text-gray-500">Судові справи</p>
                {patData.lawsuitsAsPlaintiff.map(l => (
                  <div key={l.id} className="text-[11px] text-gray-400 rounded bg-gray-800 px-2 py-1">
                    Позов проти {l.defendantName} ({l.technologyCode}) —{" "}
                    <span className={l.status === "PLAINTIFF_WON" ? "text-emerald-400" : "text-red-400"}>
                      {l.status === "PLAINTIFF_WON" ? "виграно" : "програно"}
                    </span>
                  </div>
                ))}
                {patData.lawsuitsAsDefendant.map(l => (
                  <div key={l.id} className="text-[11px] text-gray-400 rounded bg-gray-800 px-2 py-1">
                    Позов від {l.plaintiffName} ({l.technologyCode}) —{" "}
                    <span className={l.status === "PLAINTIFF_WON" ? "text-red-400" : "text-emerald-400"}>
                      {l.status === "PLAINTIFF_WON" ? "програно" : "виграно"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
