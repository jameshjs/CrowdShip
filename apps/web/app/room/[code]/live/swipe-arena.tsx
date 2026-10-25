"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { approvalScore, type PublicProposal } from "@crowdship/shared";
import { ApprovalMeter } from "@/components/approval-meter";
import { cn } from "@/lib/utils";

type Bubble = { id: number; proposalId: string; liked: boolean; x: number };

/**
 * Projector view of the swipe phase: every idea's ▼/▲ tug-of-war, re-ranked live, with a bubble
 * floating off the bar for each new swipe so the room can see the back-and-forth as it happens.
 */
export function SwipeArena({ proposals }: { proposals: PublicProposal[] }) {
  const ranked = proposals.slice().sort((a, b) => approvalScore(b.approval) - approvalScore(a.approval)).slice(0, 5);
  const prev = useRef<Map<string, { likes: number; dislikes: number }> | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const now = new Map(proposals.map((p) => [p.id, p.approval]));
    if (prev.current) {
      const fresh: Bubble[] = [];
      for (const [id, a] of now) {
        const before = prev.current.get(id) ?? { likes: 0, dislikes: 0 };
        for (let i = 0; i < Math.min(4, a.likes - before.likes); i++) fresh.push({ id: seq.current++, proposalId: id, liked: true, x: Math.random() * 30 });
        for (let i = 0; i < Math.min(4, a.dislikes - before.dislikes); i++) fresh.push({ id: seq.current++, proposalId: id, liked: false, x: Math.random() * 30 });
      }
      if (fresh.length) {
        setBubbles((b) => [...b, ...fresh].slice(-40));
        const ids = new Set(fresh.map((f) => f.id));
        setTimeout(() => setBubbles((b) => b.filter((x) => !ids.has(x.id))), 1800);
      }
    }
    prev.current = now;
  }, [proposals]);

  const swipes = proposals.reduce((n, p) => n + p.approval.likes + p.approval.dislikes, 0);

  return (
    <div className="space-y-5" data-testid="swipe-arena">
      <p className="text-fg-muted"><span className="font-semibold text-fg tabular">{swipes}</span> swipes so far. The top ideas go to the final vote.</p>
      <ul className="space-y-5">
        <AnimatePresence initial={false}>
          {ranked.map((p, i) => {
            const total = p.approval.likes + p.approval.dislikes;
            return (
              <motion.li key={p.id} layout transition={{ type: "spring", stiffness: 200, damping: 26 }} className="relative space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-xl font-medium"><span className="mr-2 font-mono text-fg-subtle">{i + 1}</span>{p.title}</p>
                  <span className="text-2xl font-semibold tabular">{total ? `${Math.round((p.approval.likes / total) * 100)}%` : "—"}</span>
                </div>
                <ApprovalMeter likes={p.approval.likes} dislikes={p.approval.dislikes} large />
                <AnimatePresence>
                  {bubbles.filter((b) => b.proposalId === p.id).map((b) => (
                    <motion.span
                      key={b.id}
                      className={cn("pointer-events-none absolute bottom-2 text-4xl font-black drop-shadow", b.liked ? "text-success" : "text-danger")}
                      style={b.liked ? { right: `${4 + b.x}%` } : { left: `${4 + b.x}%` }}
                      initial={{ y: 0, opacity: 0, scale: 0.6 }}
                      animate={{ y: -70, opacity: [0, 1, 1, 0], scale: [0.6, 1.2, 1, 0.9] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.6, ease: "easeOut" }}
                      aria-hidden
                    >
                      {b.liked ? "▲" : "▼"}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
