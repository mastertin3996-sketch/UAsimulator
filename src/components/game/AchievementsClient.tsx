"use client";

import { useEffect, useState } from "react";
import { Award, Lock, Gift, Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AchievementRow {
  code: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAtTick: string | null;
}

interface DailyStatus {
  canClaim: boolean;
  streakCount: number;
  ticksUntilNextClaim: number;
}

export default function AchievementsClient() {
  const [achievements, setAchievements] = useState<AchievementRow[] | null>(null);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const refresh = () => {
    fetch("/api/achievements")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setAchievements(d.achievements); setUnlockedCount(d.unlockedCount); } })
      .catch(() => {});
    fetch("/api/player/daily-claim")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDaily(d); })
      .catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimMsg(null);
    try {
      const res = await fetch("/api/player/daily-claim", { method: "POST" });
      const data = await res.json();
      setClaimMsg(res.ok ? `✓ ${data.message}` : `✗ ${data.error}`);
      if (res.ok) refresh();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Award size={20} className="text-emerald-400" /> Досягнення
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          {achievements ? `${unlockedCount} з ${achievements.length} розблоковано` : "Завантаження..."}
        </p>
      </div>

      {/* Daily login bonus */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Gift size={22} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-100">Щоденний бонус</p>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Flame size={12} className="text-orange-400" />
              Стрік: {daily?.streakCount ?? 0}
              {!daily?.canClaim && daily && daily.ticksUntilNextClaim > 0 && (
                <span> · наступний через {daily.ticksUntilNextClaim} тіків</span>
              )}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={!daily?.canClaim || claiming}
          onClick={handleClaim}
        >
          {claiming ? <Loader2 size={14} className="animate-spin" /> : daily?.canClaim ? "Отримати" : "Вже отримано"}
        </Button>
      </div>
      {claimMsg && <p className="text-xs text-gray-400">{claimMsg}</p>}

      {/* Achievement list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {achievements === null && Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
        {achievements?.map(a => (
          <div
            key={a.code}
            className={cn(
              "rounded-xl border p-4 flex items-start gap-3",
              a.unlocked
                ? "border-emerald-800/40 bg-emerald-950/20"
                : "border-gray-800 bg-gray-900/50",
            )}
          >
            {a.unlocked
              ? <Award size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              : <Lock size={20} className="text-gray-600 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", a.unlocked ? "text-gray-100" : "text-gray-500")}>
                {a.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
