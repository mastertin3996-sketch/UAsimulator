"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Loader2,
  AlertCircle, ChevronLeft, ChevronRight, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type WStatus = "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED";

interface RequestRow {
  id           : string;
  userId       : string;
  username     : string;
  email        : string;
  amountPC     : number;
  amountUSD    : number;
  payoutMethod : string;
  payoutAddress: string;
  status       : WStatus;
  adminNote    : string | null;
  processedBy  : string | null;
  createdAt    : string;
  processedAt  : string | null;
}

interface AdminData {
  total: number; page: number; pages: number;
  requests: RequestRow[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<WStatus, { label: string; cls: string }> = {
  PENDING   : { label: "Очікує",      cls: "bg-amber-950/60 text-amber-400 border-amber-800"   },
  PROCESSING: { label: "Обробляється", cls: "bg-blue-950/60 text-blue-400 border-blue-800"      },
  APPROVED  : { label: "Виплачено",   cls: "bg-emerald-950/60 text-emerald-400 border-emerald-800" },
  REJECTED  : { label: "Відхилено",   cls: "bg-red-950/60 text-red-400 border-red-800"         },
};

function StatusBadge({ s }: { s: WStatus }) {
  const c = STATUS_CFG[s];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", c.cls)}>
      {c.label}
    </span>
  );
}

// ─── Action modal ─────────────────────────────────────────────────────────────

type ActionType = "approve" | "reject" | "confirm" | null;

function ActionModal({
  request,
  action,
  onClose,
  onDone,
}: {
  request : RequestRow;
  action  : ActionType;
  onClose : () => void;
  onDone  : () => void;
}) {
  const [note,    setNote]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  if (!action) return null;

  const isConfirm = action === "confirm";
  const isApprove = action === "approve";

  const submit = async () => {
    setLoading(true); setError("");
    try {
      let res: Response;
      if (isConfirm) {
        res = await fetch(`/api/admin/withdrawals/${request.id}`, {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ note }),
        });
      } else {
        res = await fetch(`/api/admin/withdrawals/${request.id}`, {
          method : "PATCH",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ action, note }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Помилка");
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<string, string> = {
    approve: "Схвалити заявку",
    reject : "Відхилити заявку",
    confirm: "Підтвердити виплату",
  };
  const descs: Record<string, string> = {
    approve: `Схвалити виведення ${request.amountPC} PC ($${request.amountUSD}) для @${request.username}. Статус зміниться на PROCESSING.`,
    reject : `Відхилити заявку. ${request.amountPC} PC будуть автоматично повернені на баланс гравця @${request.username}.`,
    confirm: `Підтвердити що ${request.amountPC} PC ($${request.amountUSD}) було виплачено @${request.username} через ${request.payoutMethod}.`,
  };
  const btnColors: Record<string, string> = {
    approve: "bg-blue-600 hover:bg-blue-500",
    reject : "bg-red-700 hover:bg-red-600",
    confirm: "bg-emerald-600 hover:bg-emerald-500",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">{titles[action]}</h2>
        <p className="text-sm text-gray-400">{descs[action]}</p>

        {/* Request summary */}
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Гравець</span>
            <span className="text-white font-medium">@{request.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Email</span>
            <span className="text-gray-300 font-mono text-xs">{request.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Сума</span>
            <span className="text-violet-400 font-mono font-semibold">{request.amountPC} PC ($${request.amountUSD})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Метод</span>
            <span className="text-gray-300">{request.payoutMethod}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 shrink-0">Адреса</span>
            <span className="text-gray-200 font-mono text-xs text-right break-all">{request.payoutAddress}</span>
          </div>
        </div>

        {/* Admin note */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            {action === "reject" ? "Причина відмови (обов'язково)" : "Примітка (необов'язково)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={action === "reject" ? "Наприклад: неправильна адреса, підозріла активність..." : "Txid або коментар..."}
            className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5
                       resize-none focus:outline-none focus:border-gray-500"
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={loading || (action === "reject" && !note.trim())}
            className={cn(
              "flex-1 py-2 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2",
              btnColors[action],
            )}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {titles[action]}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Request row ──────────────────────────────────────────────────────────────

function RequestCard({ r, onAction }: { r: RequestRow; onAction: (r: RequestRow, a: ActionType) => void }) {
  return (
    <tr className="hover:bg-gray-800/40 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {new Date(r.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </td>
      <td className="px-4 py-3">
        <p className="text-white font-medium text-sm">@{r.username}</p>
        <p className="text-gray-600 text-xs">{r.email}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-violet-400 font-mono font-semibold text-sm">{r.amountPC.toFixed(2)} PC</p>
        <p className="text-emerald-400 font-mono text-xs">${r.amountUSD.toFixed(2)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-gray-400 text-xs">{r.payoutMethod}</p>
        <p className="text-gray-300 font-mono text-xs max-w-[200px] truncate">{r.payoutAddress}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge s={r.status} /></td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5">
          {r.status === "PENDING" && (
            <>
              <button
                onClick={() => onAction(r, "approve")}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-300 text-xs rounded-lg transition-colors"
              >
                <CheckCircle2 size={11} /> Схвалити
              </button>
              <button
                onClick={() => onAction(r, "reject")}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 text-xs rounded-lg transition-colors"
              >
                <XCircle size={11} /> Відхилити
              </button>
            </>
          )}
          {r.status === "PROCESSING" && (
            <button
              onClick={() => onAction(r, "confirm")}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs rounded-lg transition-colors"
            >
              <Send size={11} /> Виплачено
            </button>
          )}
        </div>
        {r.adminNote && (
          <p className="text-gray-600 text-xs mt-1 max-w-[200px] truncate" title={r.adminNote}>{r.adminNote}</p>
        )}
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "PENDING",    label: "Очікують"   },
  { value: "PROCESSING", label: "В обробці"  },
  { value: "APPROVED",   label: "Виплачено"  },
  { value: "REJECTED",   label: "Відхилено"  },
  { value: "ALL",        label: "Всі"        },
];

export default function AdminWithdrawalsClient() {
  const [data,    setData]    = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState("PENDING");
  const [page,    setPage]    = useState(1);
  const [modal,   setModal]   = useState<{ request: RequestRow; action: ActionType } | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/withdrawals?status=${status}&page=${page}`);
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const handleAction = (request: RequestRow, action: ActionType) => {
    setModal({ request, action });
  };

  const handleDone = () => {
    setModal(null);
    load();
  };

  if (forbidden) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <ShieldCheck size={40} className="text-red-500 mx-auto mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Доступ заборонено</h1>
      <p className="text-gray-500 text-sm">Ця сторінка доступна лише адміністраторам</p>
    </div>
  );

  return (
    <>
      {modal && (
        <ActionModal
          request={modal.request}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={handleDone}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={22} className="text-emerald-400" /> Адмін: Заявки на виведення
          </h1>
          <p className="text-gray-500 text-sm mt-1">Управління виплатами PremiumCoin</p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 border-b border-gray-800">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatus(f.value); setPage(1); }}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
                status === f.value
                  ? "text-white border-emerald-500"
                  : "text-gray-500 border-transparent hover:text-gray-300",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock size={15} />
                Заявки {data ? `(${data.total})` : ""}
              </CardTitle>
              <button
                onClick={load}
                className="text-xs text-gray-500 hover:text-white border border-gray-700 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 transition-colors"
              >
                Оновити
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    {["Дата", "Гравець", "Сума", "Реквізити", "Статус", "Дії"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wide font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                        ))}
                      </tr>
                    ))
                  ) : !data || data.requests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        Заявок немає
                      </td>
                    </tr>
                  ) : (
                    data.requests.map((r) => (
                      <RequestCard key={r.id} r={r} onAction={handleAction} />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800">
                <span className="text-xs text-gray-500">Сторінка {data.page} з {data.pages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                    disabled={page >= data.pages}
                    className="p-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
