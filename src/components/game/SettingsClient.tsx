"use client";

import { useEffect, useState } from "react";
import { Settings, User, Building2, Lock, CheckCircle2, AlertCircle, Loader2, TriangleAlert, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SettingsData {
  user: { id: string; email: string; username: string; level: number; createdAt: string };
  company: { id: string; name: string; slogan: string | null; brandLevel: number } | null;
}

// ─── Save state hook ──────────────────────────────────────────────────────────

type SaveState = "idle" | "loading" | "ok" | "error";

function useSave() {
  const [state, setState] = useState<SaveState>("idle");
  const [msg,   setMsg]   = useState("");

  const save = async (body: Record<string, unknown>) => {
    setState("loading"); setMsg("");
    try {
      const res  = await fetch("/api/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Помилка");
      setState("ok");
      setTimeout(() => setState("idle"), 2500);
      return true;
    } catch (e: any) {
      setMsg(e.message);
      setState("error");
      setTimeout(() => setState("idle"), 4000);
      return false;
    }
  };

  return { state, msg, save };
}

// ─── Inline feedback ──────────────────────────────────────────────────────────

function Feedback({ state, msg }: { state: SaveState; msg: string }) {
  if (state === "loading") return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <Loader2 size={12} className="animate-spin" /> Збереження…
    </span>
  );
  if (state === "ok")    return <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={12} /> Збережено</span>;
  if (state === "error") return <span className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle size={12} /> {msg}</span>;
  return null;
}

// ─── Input field ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-gray-600";

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({ data, onRefresh }: { data: SettingsData; onRefresh: () => void }) {
  const [username, setUsername] = useState(data.user.username);
  const { state, msg, save } = useSave();

  const dirty = username !== data.user.username;

  const submit = async () => {
    if (!dirty) return;
    const ok = await save({ username });
    if (ok) onRefresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><User size={16} /> Профіль гравця</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Email">
            <input type="email" value={data.user.email} disabled className={cn(inputCls, "opacity-50 cursor-not-allowed")} />
          </Field>
          <Field label="Нікнейм (3–24 символи)">
            <input
              type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              placeholder="your_username"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5">
            <span className="text-gray-500 text-xs">Рівень гравця</span>
            <span className="text-white font-bold ml-2">{data.user.level}</span>
          </div>
          <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5">
            <span className="text-gray-500 text-xs">Дата реєстрації</span>
            <span className="text-white font-mono text-xs ml-2">
              {new Date(data.user.createdAt).toLocaleDateString("uk-UA")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={submit}
            disabled={!dirty || state === "loading"}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Зберегти профіль
          </button>
          <Feedback state={state} msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Password section ─────────────────────────────────────────────────────────

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const { state, msg, save } = useSave();

  const mismatch = next !== confirm && confirm.length > 0;

  const submit = async () => {
    if (mismatch || !current || !next) return;
    const ok = await save({ currentPassword: current, newPassword: next });
    if (ok) { setCurrent(""); setNext(""); setConfirm(""); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lock size={16} /> Зміна пароля</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Поточний пароль">
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} placeholder="••••••••" />
          </Field>
          <Field label="Новий пароль (мін. 6)">
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} placeholder="••••••••" />
          </Field>
          <Field label="Повторити пароль">
            <input
              type="password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={cn(inputCls, mismatch && "border-red-600")}
              placeholder="••••••••"
            />
            {mismatch && <p className="text-xs text-red-400 mt-1">Паролі не збігаються</p>}
          </Field>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={submit}
            disabled={!current || !next || mismatch || state === "loading"}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Змінити пароль
          </button>
          <Feedback state={state} msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Company section ──────────────────────────────────────────────────────────

function CompanySection({ company, onRefresh }: {
  company: NonNullable<SettingsData["company"]>; onRefresh: () => void;
}) {
  const [name,   setName]   = useState(company.name);
  const [slogan, setSlogan] = useState(company.slogan ?? "");
  const { state, msg, save } = useSave();

  const dirty = name !== company.name || slogan !== (company.slogan ?? "");

  const submit = async () => {
    if (!dirty) return;
    const body: Record<string, unknown> = {};
    if (name   !== company.name)               body.companyName   = name;
    if (slogan !== (company.slogan ?? ""))     body.companySlogan = slogan || null;
    const ok = await save(body);
    if (ok) onRefresh();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Building2 size={16} /> Компанія</CardTitle>
          <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2.5 py-1 rounded-lg">
            Бренд рів. {company.brandLevel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Назва компанії (2–60 символів)">
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Назва вашої компанії"
            />
          </Field>
          <Field label="Слоган (необов'язково)">
            <input
              type="text" value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              maxLength={120}
              className={inputCls}
              placeholder="Коротке гасло компанії"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={submit}
            disabled={!dirty || state === "loading" || name.length < 2}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Зберегти компанію
          </button>
          <Feedback state={state} msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Hard Reset ───────────────────────────────────────────────────────────────

function HardResetSection() {
  const [open,  setOpen]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/player/reset", { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Помилка сервера");
      }
      // Full page reload so all cached state (wallet, company) is refreshed
      window.location.href = "/dashboard";
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      {/* Danger zone card */}
      <div className="rounded-xl border border-red-900/50 bg-red-950/10 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-red-900/40 bg-red-950/20">
          <TriangleAlert size={15} className="text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-red-300">Небезпечна зона</span>
        </div>
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Почати заново</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Видаляє всі підприємства, запаси, оферти, контракти та фінансову історію.
              Рейтинг та активи обнуляються. Стартовий капітал — ₴50&nbsp;000.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition-all shrink-0",
              "text-white bg-red-700 border-red-600",
              "hover:bg-red-600 hover:border-red-500 hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]",
              "active:scale-95",
            )}
          >
            <RefreshCw size={13} />
            Почати заново
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
        >
          <div className="bg-gray-900 border border-red-900/60 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-950/60 border border-red-900/50 shrink-0">
                <TriangleAlert size={18} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Скинути ігровий прогрес?</h2>
                <p className="text-xs text-gray-500">Ця дія незворотна</p>
              </div>
            </div>

            {/* Warning text */}
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Ви впевнені, що хочете видалити весь ігровий прогрес?{" "}
              <strong className="text-red-400">Цю дію неможливо скасувати!</strong>
            </p>

            {/* Bullet list */}
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 mb-5 space-y-1.5">
              {[
                "Всі підприємства, цехи, лінії та обладнання будуть видалені",
                "Складські запаси та вітрини очищено",
                "Ринкові оферти та контракти анульовано",
                "Рейтинг та активи скинуто до нуля",
                "Нараховується стартовий капітал ₴50 000",
                "PremiumCoin залишається незмінним",
              ].map((line) => (
                <p key={line} className="text-xs text-red-200/80 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 shrink-0">•</span>
                  {line}
                </p>
              ))}
            </div>

            {error && (
              <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5">
                <AlertCircle size={12} /> {error}
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setOpen(false); setError(""); }}
                disabled={busy}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl transition-colors disabled:opacity-40"
              >
                Скасувати
              </button>
              <button
                onClick={handleReset}
                disabled={busy}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-700 hover:bg-red-600 border border-red-600 text-white rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-[0_0_14px_rgba(239,68,68,0.35)]"
              >
                {busy
                  ? <><Loader2 size={13} className="animate-spin" /> Видалення…</>
                  : <><RefreshCw size={13} /> Так, видалити все</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsClient() {
  const [data,    setData]    = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings size={22} className="text-gray-400" /> Налаштування
        </h1>
        <p className="text-gray-500 text-sm mt-1">Профіль гравця та параметри компанії</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !data ? (
        <p className="text-red-400">Не вдалося завантажити налаштування</p>
      ) : (
        <>
          <ProfileSection data={data} onRefresh={load} />
          <PasswordSection />
          {data.company
            ? <CompanySection company={data.company} onRefresh={load} />
            : (
              <Card>
                <CardContent className="py-8 text-center text-gray-500 text-sm">
                  Компанія ще не створена
                </CardContent>
              </Card>
            )
          }
          <HardResetSection />
        </>
      )}
    </div>
  );
}
