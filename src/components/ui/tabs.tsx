"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useState } from "react";

const TabsCtx = createContext<{ active: string; set: (v: string) => void }>({
  active: "",
  set: () => {},
});

function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [active, set] = useState(defaultValue);
  return (
    <TabsCtx.Provider value={{ active, set }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsCtx.Provider>
  );
}

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const { active, set } = useContext(TabsCtx);
  const isActive = active === value;
  return (
    <button
      onClick={() => set(value)}
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
        isActive
          ? "bg-emerald-600 text-white shadow-sm"
          : "text-gray-400 hover:text-white hover:bg-gray-800",
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const { active } = useContext(TabsCtx);
  if (active !== value) return null;
  return <div>{children}</div>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
