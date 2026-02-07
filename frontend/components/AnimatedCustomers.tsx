"use client";

import { useState, useEffect } from "react";

const customers = [
  { label: "DAOs", stat: "50,000+", desc: "managing $25B+ in treasuries" },
  { label: "Crypto Startups", stat: "1000s", desc: "paying global contributors" },
  { label: "Remote Teams", stat: "Worldwide", desc: "with cross-border payments" },
  { label: "Enterprise", stat: "Fortune 500", desc: "needing private payroll" },
];

export function AnimatedCustomers() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % customers.length);
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const current = customers[currentIndex];

  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      <div className="flex items-center gap-3">
        <span className="text-zk-muted text-sm">Built for</span>
        <div
          className={`
            relative overflow-hidden h-8 min-w-[180px]
            transition-all duration-300 ease-out
            ${isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}
          `}
        >
          <span className="font-display text-2xl font-bold text-zk-accent">
            {current.label}
          </span>
        </div>
      </div>
      <div
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full
          bg-zk-surface border border-white/[0.06]
          transition-all duration-300 ease-out
          ${isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"}
        `}
      >
        <span className="font-display text-sm font-semibold text-zk-text tabular-nums">
          {current.stat}
        </span>
        <span className="text-zk-dim text-sm">{current.desc}</span>
      </div>

      {/* Progress indicators */}
      <div className="flex items-center gap-2 mt-2">
        {customers.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setIsAnimating(true);
              setTimeout(() => {
                setCurrentIndex(i);
                setIsAnimating(false);
              }, 150);
            }}
            className={`
              w-2 h-2 rounded-full transition-all duration-300
              ${i === currentIndex
                ? "bg-zk-accent w-6"
                : "bg-white/20 hover:bg-white/40"
              }
            `}
            aria-label={`Show ${customers[i].label}`}
          />
        ))}
      </div>
    </div>
  );
}
