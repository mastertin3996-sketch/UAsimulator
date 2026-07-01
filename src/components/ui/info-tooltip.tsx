"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

// Легкий inline-глосарій: клік/тап відкриває коротке пояснення терміну.
// Навмисно click-based (не hover-only), щоб працювало однаково на мобільному й десктопі.
export function InfoTooltip({ text, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Пояснення терміну"
        className="text-gray-600 hover:text-emerald-400 transition-colors"
      >
        <HelpCircle size={12} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 w-56 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}
