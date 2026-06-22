import { useState, useCallback } from 'react';
import type { DashboardState } from '../types';
import { DashboardHeader }    from './DashboardHeader';
import { RegionalHubsGrid }   from './RegionalHubsGrid';
import { EnterpriseManager }  from './EnterpriseManager';
import { HRPanel }            from './HRPanel';
import { MarketPanel }        from './MarketPanel';

interface Props { initialState: DashboardState }

export function Dashboard({ initialState }: Props) {
  const [state, setState] = useState<DashboardState>(initialState);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3_000);
  };

  // ── Action: repair equipment ─────────────────────────────────────────────
  const handleRepair = useCallback((equipmentId: string) => {
    setState(prev => ({
      ...prev,
      player: {
        ...prev.player,
        cashBalance: prev.player.cashBalance - 18_000,
      },
      cityHubs: prev.cityHubs.map(hub => ({
        ...hub,
        enterprises: hub.enterprises.map(ent => ({
          ...ent,
          workshops: ent.workshops.map(ws => ({
            ...ws,
            equipment: ws.equipment.map(eq =>
              eq.id === equipmentId
                ? { ...eq, wearAndTear: 0.25, status: 'OPERATIONAL' as const, isBroken: false }
                : eq,
            ),
          })),
        })),
      })),
    }));
    showToast('✅ ТО проведено. Знос знижено до 25%. Вартість: ₴18 000');
  }, []);

  // ── Action: raise salaries by 10% ────────────────────────────────────────
  const handleRaiseSalary = useCallback((enterpriseId: string) => {
    setState(prev => ({
      ...prev,
      cityHubs: prev.cityHubs.map(hub => ({
        ...hub,
        enterprises: hub.enterprises.map(ent => {
          if (ent.id !== enterpriseId) return ent;
          return {
            ...ent,
            employees: ent.employees.map(emp => {
              const newSalary = Math.round(emp.salaryUah * 1.10);
              const newMood   = Math.min(1, emp.mood + 0.05);
              return {
                ...emp,
                salaryUah: newSalary,
                mood:      newMood,
                efficiency: newMood >= 0.85 ? 1.15 : newMood >= 0.60 ? 1.0 : newMood >= 0.40 ? 0.85 : 0.65,
              };
            }),
          };
        }),
      })),
    }));
    showToast('💰 Зарплати підвищено на 10%. Настрій покращено +5%.');
  }, []);

  // Aggregated stats
  const totalEmployees = state.cityHubs
    .flatMap(h => h.enterprises.flatMap(e => e.employees)).length;
  const activeCities   = state.cityHubs.filter(h => h.office?.isOperational).length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200">
      {/* Sticky header */}
      <DashboardHeader
        player={state.player}
        tax={state.taxSummary}
        totalEmps={totalEmployees}
        cityCount={activeCities}
        gameDayLabel={state.gameDayLabel}
        tick={state.currentTick}
      />

      {/* Main content grid */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-8">
        {/* Row 1: Regional hubs */}
        <RegionalHubsGrid hubs={state.cityHubs} />

        {/* Row 2: Enterprises + HR — side by side on large screens */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <EnterpriseManager
            hubs={state.cityHubs}
            onRepair={handleRepair}
            onRaiseSalary={handleRaiseSalary}
          />
          <HRPanel
            hubs={state.cityHubs}
            onRaiseSalary={handleRaiseSalary}
          />
        </div>

        {/* Row 3: Market + Retail */}
        <MarketPanel
          orders={state.openMarketOrders}
          stores={state.retailStores}
        />
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
          px-5 py-3 rounded-xl shadow-2xl
          bg-slate-800 border border-slate-600 text-slate-100 text-sm
          animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
