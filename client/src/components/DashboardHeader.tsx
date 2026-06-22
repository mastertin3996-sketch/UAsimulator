import {
  Building2, Wallet, TrendingUp, Users, AlertTriangle,
  Zap, Star, ChevronRight,
} from 'lucide-react';
import type { Player, TaxSummary } from '../types';
import { fmt } from '../types';

interface Props {
  player:      Player;
  tax:         TaxSummary;
  totalEmps:   number;
  cityCount:   number;
  gameDayLabel: string;
  tick:        number;
}

function StatCard({
  icon: Icon, label, value, sub, alert = false, accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`
      flex items-start gap-3 rounded-xl px-4 py-3 border
      ${alert   ? 'bg-red-950/40 border-red-800/50'    :
        accent  ? 'bg-indigo-950/40 border-indigo-700/50' :
                  'bg-slate-800/50 border-slate-700/40'}
    `}>
      <div className={`mt-0.5 rounded-lg p-2
        ${alert ? 'bg-red-900/50 text-red-400' : accent ? 'bg-indigo-800/50 text-indigo-400' : 'bg-slate-700/60 text-slate-300'}
      `}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-semibold tabular-nums leading-tight
          ${alert ? 'text-red-300' : accent ? 'text-indigo-200' : 'text-white'}
        `}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function DashboardHeader({ player, tax, totalEmps, cityCount, gameDayLabel, tick }: Props) {
  const taxUrgent = tax.totalDebtUah > 0 && (tax.nextDueTick - tick) < 15;

  return (
    <header className="border-b border-slate-700/60 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-30">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 shadow-lg shadow-indigo-900/50">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">{player.companyName}</h1>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {gameDayLabel}
              <ChevronRight size={10} className="text-slate-600" />
              Тік {tick}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <Star size={12} className="text-amber-400 fill-amber-400" />
            <span className="text-xs text-slate-300 tabular-nums">
              Репутація {player.reputationScore.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <Zap size={12} className="text-cyan-400" />
            <span className="text-xs text-slate-300 tabular-nums">
              Кредит {player.creditRating.toFixed(1)} / 10
            </span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 px-6 py-3">
        <StatCard
          icon={Wallet}
          label="Залишок (UAH)"
          value={fmt.uah(player.cashBalance)}
          sub="Поточний рахунок"
          accent
        />
        <StatCard
          icon={TrendingUp}
          label="Чиста вартість"
          value={fmt.uah(player.netWorth)}
          sub="Активи − Борги"
        />
        <StatCard
          icon={Building2}
          label="Активні міста"
          value={String(cityCount)}
          sub="Хаби з офісами"
        />
        <StatCard
          icon={Users}
          label="Персонал"
          value={String(totalEmps)}
          sub="Всього по компанії"
        />
        <StatCard
          icon={AlertTriangle}
          label="Борг ПДВ"
          value={tax.totalDebtUah > 0 ? fmt.uah(tax.totalDebtUah) : '₴ 0'}
          sub={tax.totalDebtUah > 0
            ? `Дедлайн: тік ${tax.nextDueTick} (залишилось ${tax.nextDueTick - tick})`
            : 'Без заборгованостей'}
          alert={taxUrgent}
        />
        <StatCard
          icon={Zap}
          label="ЄСВ нараховано"
          value={fmt.uah(tax.esvAccruedUah)}
          sub={`ПДВ ${fmt.uah(tax.vatAccruedUah)} | CIT ~${fmt.uah(tax.citEstimateUah)}`}
        />
      </div>
    </header>
  );
}
