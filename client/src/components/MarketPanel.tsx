import {
  ShoppingCart, TrendingUp, Clock, Star,
  BarChart3, ArrowUpRight, ArrowDownRight, CircleDollarSign,
  Zap,
} from 'lucide-react';
import type { MarketOrder, RetailStore, MarketOrderStatus } from '../types';
import { fmt } from '../types';

// ── Market order row ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<MarketOrderStatus, string> = {
  OPEN:             'bg-emerald-900/50 text-emerald-300 border-emerald-800/40',
  PARTIALLY_FILLED: 'bg-indigo-900/50  text-indigo-300  border-indigo-800/40',
  FILLED:           'bg-slate-700/50   text-slate-400   border-slate-600/40',
  CANCELLED:        'bg-red-900/50     text-red-400     border-red-800/40',
  EXPIRED:          'bg-slate-700/50   text-slate-500   border-slate-600/40',
};

const STATUS_UA: Record<MarketOrderStatus, string> = {
  OPEN:             'Відкрито',
  PARTIALLY_FILLED: 'Частково',
  FILLED:           'Виконано',
  CANCELLED:        'Скасовано',
  EXPIRED:          'Прострочено',
};

function FillBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? (filled / total) * 100 : 0;
  return (
    <div className="h-1 w-full rounded-full bg-slate-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 30 ? 'bg-indigo-500' : 'bg-slate-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function OrderRow({ order }: { order: MarketOrder }) {
  const isMine     = order.sellerName.includes('Надія');
  const expiresIn  = Math.ceil((new Date(order.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24));
  const nearExpiry = expiresIn <= 7;

  return (
    <div className={`rounded-lg px-3 py-2.5 border transition-colors
      ${isMine ? 'bg-indigo-950/30 border-indigo-800/40' : 'bg-slate-800/30 border-slate-700/30'}
    `}>
      <div className="flex items-start gap-2">
        {/* Buy/Sell badge */}
        <span className={`flex-shrink-0 flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-xs font-bold
          ${order.type === 'SELL' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'}
        `}>
          {order.type === 'SELL'
            ? <ArrowUpRight size={10} />
            : <ArrowDownRight size={10} />}
          {order.type}
        </span>

        {/* Resource info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-200 font-medium truncate">{order.resourceName}</p>
            {isMine && (
              <span className="flex-shrink-0 px-1.5 text-xs rounded bg-indigo-900/40 text-indigo-400 border border-indigo-800/40">
                Мій
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">{order.resourceType} · {order.sellerName}</p>
        </div>

        {/* Status */}
        <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded border ${STATUS_STYLE[order.status]}`}>
          {STATUS_UA[order.status]}
        </span>
      </div>

      {/* Metrics row */}
      <div className="mt-2 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1 text-slate-300 tabular-nums font-semibold">
          <CircleDollarSign size={11} className="text-indigo-400" />
          {fmt.uah(order.pricePerUnit)}/од
        </div>
        <div className="flex items-center gap-1 text-slate-400 tabular-nums">
          <Star size={10} className="text-amber-400 fill-amber-400/40" />
          {order.quality.toFixed(1)}/10
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-slate-500 mb-0.5">
            <span className="tabular-nums">{order.quantityFilled}/{order.quantityTotal} од</span>
            <span className={nearExpiry ? 'text-amber-400' : ''}>
              {nearExpiry && <Clock size={9} className="inline mr-0.5" />}
              {expiresIn}д
            </span>
          </div>
          <FillBar filled={order.quantityFilled} total={order.quantityTotal} />
        </div>
      </div>
    </div>
  );
}

// ── Retail store card ─────────────────────────────────────────────────────────

function RetailCard({ store }: { store: RetailStore }) {
  const fillRate   = store.npcDemandUnitsPerDay > 0
    ? store.soldUnitsToday / store.npcDemandUnitsPerDay : 0;
  const scoreColor =
    store.attractivenessScore >= 3.0 ? 'text-emerald-400' :
    store.attractivenessScore >= 1.5 ? 'text-amber-400'   : 'text-red-400';
  const scoreBg =
    store.attractivenessScore >= 3.0 ? 'bg-emerald-900/30 border-emerald-800/40' :
    store.attractivenessScore >= 1.5 ? 'bg-amber-900/30 border-amber-800/40'     :
                                        'bg-red-900/30 border-red-800/40';

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{store.name}</p>
          <p className="text-xs text-slate-500">{store.productName}</p>
        </div>
        <div className={`px-2 py-1 rounded-lg border text-center flex-shrink-0 ml-2 ${scoreBg}`}>
          <p className={`text-base font-bold tabular-nums leading-none ${scoreColor}`}>
            {store.attractivenessScore.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Score</p>
        </div>
      </div>

      {/* Quality^1.5 formula breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
        <div className="rounded-lg bg-slate-700/30 px-2 py-1.5 text-center">
          <p className="text-slate-400 text-xs">Якість</p>
          <p className="text-white font-semibold tabular-nums">{store.avgQuality.toFixed(1)}/10</p>
          <p className="text-slate-500">q^1.5 = {Math.pow(store.avgQuality, 1.5).toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-slate-700/30 px-2 py-1.5 text-center">
          <p className="text-slate-400 text-xs">Ціна</p>
          <p className="text-white font-semibold tabular-nums">{fmt.uah(store.retailPriceUah)}</p>
          <p className="text-slate-500">÷ {store.retailPriceUah}</p>
        </div>
        <div className="rounded-lg bg-slate-700/30 px-2 py-1.5 text-center">
          <p className="text-slate-400 text-xs">Персонал</p>
          <p className="text-white font-semibold tabular-nums">×{store.staffEfficiency.toFixed(2)}</p>
          <p className="text-slate-500">ефект.</p>
        </div>
      </div>

      {/* Demand fill */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span className="flex items-center gap-1">
            <BarChart3 size={10} />
            Продажі сьогодні
          </span>
          <span className="tabular-nums text-slate-300">
            {fmt.fraction(store.soldUnitsToday, store.npcDemandUnitsPerDay)} од
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-700 overflow-hidden mb-1">
          <div
            className={`h-full rounded-full ${fillRate >= 0.8 ? 'bg-emerald-500' : fillRate >= 0.5 ? 'bg-indigo-500' : 'bg-amber-500'}`}
            style={{ width: `${fillRate * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>NPC попит: {store.npcDemandUnitsPerDay} од/день</span>
          <span className="text-emerald-300 tabular-nums font-medium">
            {fmt.uah(store.dailyRevenueUah)}/день
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  orders: MarketOrder[];
  stores: RetailStore[];
}

export function MarketPanel({ orders, stores }: Props) {
  const myOrders    = orders.filter(o => o.sellerName.includes('Надія'));
  const totalRevenue = stores.reduce((s, r) => s + r.dailyRevenueUah, 0);
  const totalSold   = stores.reduce((s, r) => s + r.soldUnitsToday, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* B2B Order Book */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <ShoppingCart size={14} className="text-indigo-400" />
            B2B Ринок
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="px-2 py-0.5 rounded bg-indigo-900/40 border border-indigo-800/40 text-indigo-300">
              Мої: {myOrders.length}
            </span>
            <span>{orders.length} всього</span>
          </div>
        </div>
        <div className="space-y-2">
          {orders.map(o => <OrderRow key={o.id} order={o} />)}
        </div>
      </section>

      {/* Retail Performance */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={14} className="text-indigo-400" />
            Роздрібні продажі
          </h2>
          <div className="text-xs text-slate-400 text-right">
            <span className="text-emerald-300 font-semibold tabular-nums text-sm">
              {fmt.uah(Math.round(totalRevenue))}
            </span>
            <span className="text-slate-500">/день · {totalSold} од</span>
          </div>
        </div>

        {/* Formula reminder */}
        <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400">
          <Zap size={11} className="text-indigo-400 flex-shrink-0" />
          <span>
            Score = <span className="text-slate-300">Якість<sup>1.5</sup></span>
            {' '}÷ Ціна × ЕфектПерсоналу
          </span>
        </div>

        <div className="space-y-3">
          {stores.map(s => <RetailCard key={s.id} store={s} />)}
        </div>
      </section>
    </div>
  );
}
