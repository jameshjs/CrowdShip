"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Rocket, ArrowBigDown, ArrowBigUp, Wrench } from "lucide-react";
import { creditLine, type PublicRoomState } from "@crowdship/shared";
import { Confetti } from "@/components/confetti";

/**
 * Projector climax once the preview is released: the shipped feature, who it came from,
 * live ratings, and the real app before/after (both versions running in frames).
 */
export function ShippedBanner({ state }: { state: PublicRoomState }) {
  const { agent, round } = state;
  const winner = state.proposals.find((p) => p.id === round?.winningProposalId);
  if (!agent?.previewReleased || !agent.previewUrl || !winner) return null;
  const { yes, no, needs_improvement } = state.reviews;
  return (
    <motion.section
      className="relative grid gap-6 overflow-hidden rounded-3xl border border-accent/40 bg-bg-raised p-6 glow-brand lg:grid-cols-[1fr_auto]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="live-shipped"
    >
      <Confetti pieces={110} />
      <div className="relative flex flex-col justify-center">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-accent">
          <Rocket className="h-4 w-4" aria-hidden /> Shipped by the crowd
        </p>
        <h2 className="mt-3 text-6xl font-bold leading-[1.05] tracking-tight text-balance">
          <span className="text-brand-gradient">{winner.title}</span>
        </h2>
        <p className="mt-4 text-2xl text-fg-muted">
          {state.credits ? <>Ideas from <span className="text-fg">{creditLine(state.credits, 3)}</span></> : "The crowd voted. The AI built it."}
        </p>
        <p className="mt-6 text-xl">It&apos;s live on your phone now. Try it and rate it.</p>
        <div className="mt-6 flex gap-6 text-3xl font-semibold tabular" aria-label="Preview ratings">
          <span className="flex items-center gap-2"><ArrowBigUp className="h-7 w-7 text-success" aria-hidden /> {yes}</span>
          <span className="flex items-center gap-2"><ArrowBigDown className="h-7 w-7 text-danger" aria-hidden /> {no}</span>
          <span className="flex items-center gap-2"><Wrench className="h-7 w-7 text-warn" aria-hidden /> {needs_improvement}</span>
        </div>
      </div>
      {state.room.productionUrl && <BeforeAfter before={state.room.productionUrl} after={agent.previewUrl} />}
    </motion.section>
  );
}

/** Two phone-sized frames stacked; a divider sweeps across (or follows the pointer) to wipe A → B. */
function BeforeAfter({ before, after }: { before: string; after: string }) {
  const reduce = useReducedMotion();
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    let t = 0;
    const id = setInterval(() => {
      if (dragging.current) return;
      t += 0.035;
      setPos(50 + 42 * Math.sin(t));
    }, 40);
    return () => clearInterval(id);
  }, [reduce]);

  const follow = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="relative select-none">
      <div
        ref={box}
        className="relative h-[560px] w-[300px] overflow-hidden rounded-[2.2rem] border-4 border-line-strong bg-white shadow-2xl"
        onPointerDown={(e) => { dragging.current = true; follow(e.clientX); }}
        onPointerMove={(e) => dragging.current && follow(e.clientX)}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
      >
        <PhoneFrame src={before} title="Version A, original" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <PhoneFrame src={after} title="Version B, AI-built" />
        </div>
        {/* frames are display-only; this layer captures the drag */}
        <div className="absolute inset-0 cursor-ew-resize" />
        <div className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-brand-gradient shadow-[0_0_20px_oklch(0.7_0.17_290)]" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-sm font-semibold uppercase tracking-wider">
        <span className="text-fg-muted">A · Before</span>
        <span className="text-brand-gradient">B · After</span>
      </div>
    </div>
  );
}

/** Renders the app at phone width (390px), scaled to fit the 292px frame. */
function PhoneFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      tabIndex={-1}
      className="pointer-events-none absolute left-0 top-0 h-[748px] w-[390px] origin-top-left border-0 bg-white"
      style={{ transform: "scale(0.749)" }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
