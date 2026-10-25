"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

const COLORS = ["#dca4ef", "#9b8cf5", "#7cb8f8", "#f7c95c", "#f0707f", "#5fd6a4"];

/** A one-shot confetti burst from the top of its (relative) container. Purely decorative. */
export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        drift: (Math.random() - 0.5) * 40,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.6,
        rotate: (Math.random() - 0.5) * 720,
        size: 6 + Math.random() * 6,
        round: Math.random() < 0.3,
        color: COLORS[i % COLORS.length]!,
      })),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-0 block"
          style={{ left: `${b.x}%`, width: b.size, height: b.round ? b.size : b.size * 0.45, background: b.color, borderRadius: b.round ? 999 : 2 }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", x: `${b.drift}vw`, rotate: b.rotate, opacity: [1, 1, 0.8, 0] }}
          transition={{ duration: b.duration, delay: b.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
