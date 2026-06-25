"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell, CheckCheck, AlertTriangle, Info, Wrench,
  Hammer, BookX, ArrowRight, Loader2, Trash2, X,
  ShieldAlert, CheckCircle2, ShoppingCart, HardHat, FileWarning,
  Scale, ThumbsUp, Zap, Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id       : string;
  type     : string;
  title    : string;
  body     : string;
  entityId : string | null;
  isRead   : boolean;
  createdAt: string;
}

// ─── Type meta ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, {
  icon : React.ElementType;
  color: string;
  bg   : string;
  label: string;
  cat  : "critical" | "warning" | "system" | "market";
}> = {
  STRIKE           : { icon: ShieldAlert,   color: "text-red-400",     bg: "bg-red-950/60",      label: "Страйк",        cat: "critical" },
  EQUIPMENT_BROKEN : { icon: Hammer,        color: "text-red-500",     bg: "bg-red-950/60",      label: "Поломка",       cat: "critical" },
  STRIKE_RESOLVED  : { icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-950/60",  label: "Страйк знято",  cat: "system"   },
  EQUIPMENT_WORN   : { icon: Wrench,        color: "text-amber-400",   bg: "bg-amber-950/60",    label: "Знос обладн.",  cat: "warning"  },
  NO_RECIPE        : { icon: BookX,         color: "text-purple-400",  bg: "bg-purple-950/60",   label: "Немає рецепту", cat: "warning"  },
  LICENSE_EXPIRY   : { icon: FileWarning,   color: "text-orange-400",  bg: "bg-orange-950/60",   label: "Ліцензія",      cat: "warning"  },
  MARKET_FILLED       : { icon: ShoppingCart, color: "text-emerald-400", bg: "bg-emerald-950/60",  label: "Ринок",         cat: "market"   },
  CONSTRUCTION_DONE   : { icon: HardHat,      color: "text-blue-400",    bg: "bg-blue-950/60",     label: "Будівництво",   cat: "system"   },
  AUDIT_FINE          : { icon: Scale,        color: "text-red-400",     bg: "bg-red-950/60",      label: "Штраф",         cat: "critical" },
  AUDIT_CLEAN         : { icon: ThumbsUp,     color: "text-emerald-400", bg: "bg-emerald-950/60",  label: "Перевірка",     cat: "system"   },
  MACRO_EVENT         : { icon: Zap,          color: "text-yellow-400",  bg: "bg-yellow-950/60",   label: "Макро-подія",   cat: "system"   },
  ENTERPRISE_UNFROZEN : { icon: Unlock,       color: "text-sky-400",     bg: "bg-sky-950/60",      label: "Розморожено",   cat: "system"   },
  DEFAULT             : { icon: Info,         color: "text-blue-400",    bg: "bg-blue-950/60",     label: "Система",       cat: "system"   },
};

function getMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.DEFAULT;
}

// ─── Category config ──────────────────────────────────────────────────────────

type Category = "all" | "critical" | "warning" | "market" | "system";

const CAT_META: {
  key  : Category;
  label: string;
  types: string[];
  color: string;
}[] = [
  { key: "all",      label: "Всі",          types: [],                                                              color: "text-white"        },
  { key: "critical", label: "Критичні",     types: ["STRIKE", "EQUIPMENT_BROKEN", "AUDIT_FINE"],                               color: "text-red-400"      },
  { key: "warning",  label: "Попередження", types: ["EQUIPMENT_WORN", "NO_RECIPE", "LICENSE_EXPIRY"],                          color: "text-amber-400"    },
  { key: "market",   label: "Ринок",        types: ["MARKET_FILLED"],                                                           color: "text-emerald-400"  },
  { key: "system",   label: "Система",      types: ["STRIKE_RESOLVED", "CONSTRUCTION_DONE", "AUDIT_CLEAN", "MACRO_EVENT", "ENTERPRISE_UNFROZEN"], color: "text-blue-400"     },
];

// ─── Stats strip ──────────────────────────────────────────────────────────────

function StatsStrip({
  notes, unreadCount,
}: {
  notes: Notification[];
  unreadCount: number;
}) {
  const criticalUnread = notes.filter((n) => !n.isRead && ["STRIKE", "EQUIPMENT_BROKEN"].includes(n.type)).length;
  const warningUnread  = notes.filter((n) => !n.isRead && ["EQUIPMENT_WORN", "NO_RECIPE", "LICENSE_EXPIRY"].includes(n.type)).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
        <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Всього нових</p>
        <p className="text-2xl font-bold text-white">{unreadCount}</p>
      </div>
      <div className={cn(
        "rounded-xl border px-4 py-3",
        criticalUnread > 0 ? "border-red-900/50 bg-red-950/15" : "border-gray-800 bg-gray-900/60",
      )}>
        <div className="flex items-center gap-1 mb-1">
          <ShieldAlert size={10} className="text-red-400" />
          <p className="text-[10px] text-red-400 uppercase tracking-wide">Критичних</p>
        </div>
        <p className={cn("text-2xl font-bold", criticalUnread > 0 ? "text-red-300" : "text-white")}>
          {criticalUnread}
        </p>
      </div>
      <div className={cn(
        "rounded-xl border px-4 py-3",
        warningUnread > 0 ? "border-amber-900/50 bg-amber-950/15" : "border-gray-800 bg-gray-900/60",
      )}>
        <div className="flex items-center gap-1 mb-1">
          <AlertTriangle size={10} className="text-amber-400" />
          <p className="text-[10px] text-amber-400 uppercase tracking-wide">Попереджень</p>
        </div>
        <p className={cn("text-2xl font-bold", warningUnread > 0 ? "text-amber-300" : "text-white")}>
          {warningUnread}
        </p>
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
        <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Показано</p>
        <p className="text-2xl font-bold text-white">{notes.length}</p>
      </div>
    </div>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

function groupByDay(notes: Notification[]): { label: string; items: Notification[] }[] {
  const map = new Map<string, Notification[]>();
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  for (const n of notes) {
    const d = new Date(n.createdAt);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime())          label = "Сьогодні";
    else if (d.getTime() === yesterday.getTime()) label = "Вчора";
    else label = d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(n);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

// ─── Single notification ──────────────────────────────────────────────────────

function NotifItem({
  note, onRead, onDelete,
}: {
  note    : Notification;
  onRead  : (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const meta = getMeta(note.type);
  const Icon = meta.icon;

  async function markRead() {
    if (note.isRead) return;
    await fetch(`/api/notifications/${note.id}`, { method: "PATCH" });
    onRead(note.id);
  }

  async function deleteNote(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    await fetch(`/api/notifications/${note.id}`, { method: "DELETE" });
    onDelete(note.id);
  }

  return (
    <div
      onClick={markRead}
      className={cn(
        "group flex items-start gap-3 px-4 py-4 border-b border-gray-800/60 last:border-0 transition-colors",
        !note.isRead ? "bg-gray-800/30 cursor-pointer hover:bg-gray-800/50" : "hover:bg-gray-800/10",
      )}
    >
      {/* Icon */}
      <div className={cn("mt-0.5 p-1.5 rounded-lg flex-shrink-0", meta.bg)}>
        <Icon size={13} className={meta.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-semibold leading-snug", !note.isRead ? "text-white" : "text-gray-300")}>
            {note.title}
          </p>
          <span className="text-[10px] text-gray-600 whitespace-nowrap mt-0.5 flex-shrink-0">
            {new Date(note.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{note.body}</p>

        <div className="flex items-center gap-3 mt-1.5">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", meta.bg, meta.color)}>
            {meta.label}
          </span>
          {note.entityId && ["CONSTRUCTION_DONE", "STRIKE", "EQUIPMENT_BROKEN", "EQUIPMENT_WORN", "LICENSE_EXPIRY"].includes(note.type) && (
            <Link
              href={`/enterprises/${note.entityId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 transition-colors"
            >
              Перейти <ArrowRight size={9} />
            </Link>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        {!note.isRead && <div className="w-2 h-2 rounded-full bg-red-500 mt-1" />}
        <button
          onClick={deleteNote}
          disabled={deleting}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all disabled:opacity-30"
          title="Видалити"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const [notes,       setNotes]       = useState<Notification[]>([]);
  const [total,       setTotal]       = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll,  setMarkingAll]  = useState(false);
  const [category,    setCategory]    = useState<Category>("all");
  const [unreadOnly,  setUnreadOnly]  = useState(false);

  const skipRef = useRef(0);

  const catCfg = CAT_META.find((c) => c.key === category)!;

  const fetchNotes = useCallback(async (reset: boolean) => {
    const skip = reset ? 0 : skipRef.current;
    if (reset) setLoading(true); else setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(skip),
        ...(unreadOnly ? { unread: "true" } : {}),
      });

      // For non-all categories, we fetch multiple type filters via separate requests
      // or pass the first type (API supports single type filter)
      // Since API only accepts one type, for categories with multiple types
      // we fetch without type filter and filter client-side
      const res  = await fetch(`/api/notifications?${params}`);
      const data = await res.json();
      let incoming: Notification[] = data.notifications ?? [];

      // Client-side category filter
      if (category !== "all" && catCfg.types.length > 0) {
        incoming = incoming.filter((n) => catCfg.types.includes(n.type));
      }

      if (reset) {
        setNotes(incoming);
        skipRef.current = data.notifications?.length ?? incoming.length;
      } else {
        setNotes((prev) => [...prev, ...incoming]);
        skipRef.current += data.notifications?.length ?? incoming.length;
      }

      setTotal(data.total ?? 0);
      setUnreadCount(data.unreadCount ?? 0);
    } finally {
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  }, [category, unreadOnly, catCfg.types]);

  useEffect(() => { fetchNotes(true); }, [fetchNotes]);

  async function markAllRead() {
    setMarkingAll(true);
    const types = catCfg.types.length > 0 ? `?types=${catCfg.types.join(",")}` : "";
    await fetch(`/api/notifications/read-all${types}`, { method: "POST" });
    setNotes((prev) => prev.map((n) => {
      if (catCfg.types.length === 0 || catCfg.types.includes(n.type)) return { ...n, isRead: true };
      return n;
    }));
    setUnreadCount((c) => {
      if (catCfg.types.length === 0) return 0;
      const markedCount = notes.filter((n) => !n.isRead && catCfg.types.includes(n.type)).length;
      return Math.max(0, c - markedCount);
    });
    setMarkingAll(false);
  }

  function handleRead(id: string) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  function handleDelete(id: string) {
    const note = notes.find((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    if (note && !note.isRead) setUnreadCount((c) => Math.max(0, c - 1));
  }

  const catUnreadCount = category === "all"
    ? unreadCount
    : notes.filter((n) => !n.isRead && catCfg.types.includes(n.type)).length;

  const groups   = groupByDay(notes);
  const hasMore  = skipRef.current < total;

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell size={22} className="text-blue-400" />
            Сповіщення
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Системні повідомлення про роботу підприємств</p>
        </div>
        {catUnreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} loading={markingAll}>
            <CheckCheck size={14} />
            {category === "all" ? "Всі прочитано" : `Прочитати (${catUnreadCount})`}
          </Button>
        )}
      </div>

      {/* Stats strip */}
      {!loading && <StatsStrip notes={notes} unreadCount={unreadCount} />}

      {/* Category tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800 pb-0 flex-wrap">
        {CAT_META.map((cat) => {
          const count = cat.key === "all"
            ? unreadCount
            : notes.filter((n) => !n.isRead && cat.types.includes(n.type)).length;
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap",
                category === cat.key
                  ? cn("text-white border-blue-500")
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600",
              )}
            >
              {cat.label}
              {count > 0 && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                  category === cat.key ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Unread toggle */}
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            "flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ml-auto mb-1",
            unreadOnly
              ? "bg-red-700 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white",
          )}
        >
          {unreadOnly ? <X size={11} /> : null}
          {unreadOnly ? "Тільки нові" : "○ Тільки нові"}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-4 border-b border-gray-800 last:border-0">
              <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <Bell size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {category !== "all" || unreadOnly ? "Сповіщень за фільтром немає" : "Сповіщень поки немає"}
          </p>
          {(category !== "all" || unreadOnly) && (
            <button
              onClick={() => { setCategory("all"); setUnreadOnly(false); }}
              className="text-xs text-blue-400 hover:text-blue-300 mt-3 transition-colors"
            >
              Скинути фільтри
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="text-xs text-gray-600 uppercase tracking-wider font-medium px-1">
                {group.label}
                <span className="ml-2 normal-case font-normal text-gray-700">({group.items.length})</span>
              </p>
              <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                {group.items.map((n) => (
                  <NotifItem key={n.id} note={n} onRead={handleRead} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => fetchNotes(false)}
              disabled={loadingMore}
              className="w-full rounded-xl border border-dashed border-gray-800 py-4 text-xs text-gray-600 hover:text-gray-400 hover:border-gray-600 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loadingMore
                ? <><Loader2 size={13} className="animate-spin" /> Завантаження…</>
                : <>Завантажити більше</>
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}
