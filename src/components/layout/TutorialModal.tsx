"use client";
import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Building2, ShoppingCart, Wheat, Truck, TrendingUp, Clock } from "lucide-react";

const STORAGE_KEY = "uasim_tutorial_v1";

const STEPS = [
  {
    icon: "👋",
    title: "Ласкаво просимо до UA Simulator!",
    text: "Ти — підприємець в Україні. Керуй заводами, агрофермами, магазинами та логістикою. Заробляй, масштабуйся, перемагай конкурентів.",
    hint: null,
  },
  {
    icon: "💰",
    title: "Стартовий капітал — ₴500 000",
    text: "Це твій початковий баланс. Витрачай мудро: купи перше підприємство, найми персонал, запусти виробництво.",
    hint: "Баланс видно у верхньому правому куті екрана.",
  },
  {
    icon: "🏭",
    title: "Підприємства — серце гри",
    text: "Придбай підприємство у розділі «Підприємства → Створити». Доступні типи:",
    list: [
      { icon: <Wheat size={13} />, label: "Агроферма", desc: "вирощування зернових, тваринництво" },
      { icon: <Building2 size={13} />, label: "Завод", desc: "переробка сировини в готову продукцію" },
      { icon: <ShoppingCart size={13} />, label: "Магазин", desc: "роздрібний продаж товарів NPC" },
      { icon: <Truck size={13} />, label: "Логістика", desc: "фрахт і доставка" },
    ],
    hint: null,
  },
  {
    icon: "⚙️",
    title: "Цехи, рецепти, персонал",
    text: "У кожному підприємстві: додай цех, призначте рецепт (що виробляти), найми робітників. Без персоналу — виробництво = 0.",
    hint: "Ефективність залежить від настрою і кількості працівників.",
  },
  {
    icon: "🛒",
    title: "Ринок і продажі",
    text: "Готову продукцію продавай на «Ринку». Ціни формуються попитом і пропозицією — стеж за трендами і продавай у потрібний момент.",
    hint: "Увімкни автопродаж у налаштуваннях підприємства щоб не витрачати час вручну.",
  },
  {
    icon: "⏱️",
    title: "Ігровий тік — кожну годину",
    text: "Раз на годину відбувається ігровий тік: виробляється продукція, виплачуються зарплати, списуються кредити, змінюються ринкові ціни.",
    hint: "Весна → Літо → Осінь → Зима. 4 сезони по 30 тиків = 120 год = 5 днів реального часу.",
  },
  {
    icon: "📈",
    title: "Масштабуйся і перемагай",
    text: "Розширюй підприємства, бери кредити в банку, торгуй на біржі, укладай B2B контракти з іншими гравцями. Потрап у топ рейтингу!",
    hint: "Перевіряй «Дашборд» щодня — там видно прибутки, витрати і попередження.",
  },
];

export default function TutorialModal() {
  const [open, setOpen]   = useState(false);
  const [step, setStep]   = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  function close() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-xs text-gray-500">{step + 1} / {STEPS.length}</span>
          <button onClick={close} className="text-gray-600 hover:text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-4">
          <div className="text-center">
            <span className="text-5xl">{current.icon}</span>
          </div>
          <h2 className="text-lg font-bold text-white text-center">{current.title}</h2>
          <p className="text-sm text-gray-300 text-center leading-relaxed">{current.text}</p>

          {current.list && (
            <div className="space-y-1.5">
              {current.list.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg bg-gray-800 px-3 py-2">
                  <span className="text-emerald-400 shrink-0">{item.icon}</span>
                  <span className="text-sm text-white font-medium">{item.label}</span>
                  <span className="text-xs text-gray-500">— {item.desc}</span>
                </div>
              ))}
            </div>
          )}

          {current.hint && (
            <div className="rounded-lg bg-emerald-950/50 border border-emerald-800/40 px-3 py-2">
              <p className="text-xs text-emerald-300">💡 {current.hint}</p>
            </div>
          )}

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 pt-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-emerald-400" : "bg-gray-700 hover:bg-gray-600"}`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition-colors"
              >
                <ChevronLeft size={14} /> Назад
              </button>
            )}
            <button
              onClick={isLast ? close : () => setStep(s => s + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              {isLast ? "Почати грати!" : (<>Далі <ChevronRight size={14} /></>)}
            </button>
          </div>

          {!isLast && (
            <button onClick={close} className="w-full text-center text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Пропустити туторіал
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
