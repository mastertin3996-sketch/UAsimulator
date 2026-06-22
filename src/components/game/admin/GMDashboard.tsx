"use client";

import { useState } from "react";
import { Activity, Users, ShieldAlert, Crown } from "lucide-react";
import EcosystemTab from "./EcosystemTab";
import UsersTab     from "./UsersTab";
import SecurityTab  from "./SecurityTab";

const TABS = [
  { id: "ecosystem", label: "Стан Екосистеми", icon: Activity },
  { id: "users",     label: "Користувачі",     icon: Users },
  { id: "security",  label: "Алерт-Центр",     icon: ShieldAlert },
] as const;

type TabId = typeof TABS[number]["id"];

export default function GMDashboard({ adminName }: { adminName: string }) {
  const [tab, setTab] = useState<TabId>("ecosystem");

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-red-950 rounded-xl border border-red-800">
          <Crown size={22} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Панель Гейм-Мастера</h1>
          <p className="text-sm text-gray-500">
            <span className="text-red-400 font-medium">ADMIN</span>
            {" "}· {adminName} · Повний контроль над екосистемою
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-red-950/50 border border-red-900 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-medium">RESTRICTED ACCESS</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? id === "security"
                  ? "bg-red-800 text-white"
                  : "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "ecosystem" && <EcosystemTab />}
      {tab === "users"     && <UsersTab />}
      {tab === "security"  && <SecurityTab />}
    </div>
  );
}
