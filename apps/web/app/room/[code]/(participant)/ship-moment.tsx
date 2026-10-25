"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Rocket, Star } from "lucide-react";
import { creditLine } from "@crowdship/shared";
import { Confetti } from "@/components/confetti";
import { SailMark } from "@/components/brand";
import { TryAppButton } from "@/components/try-app";
import { Button } from "@/components/ui/button";
import { useRoomCtx } from "./room-shell";

const seenKey = (agentId: string) => `crowdship:shipped:${agentId}`;

/**
 * The climax: the moment the organizer releases the preview, every phone in the
 * room gets a full-screen "it's live" with a one-tap path to the new version.
 * Shown once per build (remembered per device).
 */
export function ShipMoment() {
  const { state, code } = useRoomCtx();
  const router = useRouter();
  const agent = state?.agent;
  const winner = state?.proposals.find((p) => p.id === state.round?.winningProposalId);
  const ready = Boolean(agent?.previewReleased && agent.previewUrl && winner);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !agent) return;
    let seen = false;
    try {
      seen = localStorage.getItem(seenKey(agent.id)) === "1";
    } catch {}
    if (!seen) setOpen(true);
  }, [ready, agent]);

  function close(rate: boolean) {
    if (agent) {
      try {
        localStorage.setItem(seenKey(agent.id), "1");
      } catch {}
    }
    setOpen(false);
    if (rate) {
      router.push(`/room/${code}`);
      setTimeout(() => document.getElementById("preview-review")?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    }
  }

  const me = state?.me;
  const headline = me?.contributed ? `Your idea is live, ${me.nickname}!` : "It's live!";
  const credit = state?.credits ? `Built from ideas by ${creditLine(state.credits)}` : "The crowd voted. The AI built it.";

  return (
    <AnimatePresence>
      {open && agent?.previewUrl && winner && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-bg/80 backdrop-blur-xl sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ship-title"
          data-testid="ship-moment"
        >
          <Confetti />
          <motion.div
            className="relative m-4 w-full max-w-md rounded-3xl border border-accent/40 bg-bg-raised p-6 text-center glow-brand safe-bottom"
            initial={{ y: 60, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
          >
            <motion.div
              className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-bg-sunken"
              initial={{ y: 30, rotate: -8 }}
              animate={{ y: [30, -6, 0], rotate: [-8, 4, 0] }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              <SailMark className="h-12 w-12" />
            </motion.div>
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              <Rocket className="h-3.5 w-3.5" aria-hidden /> Shipped
            </p>
            <h2 id="ship-title" className="mt-2 text-3xl font-bold tracking-tight text-balance">
              <span className="text-brand-gradient">{headline}</span>
            </h2>
            <p className="mt-3 text-lg font-semibold text-balance">{winner.title}</p>
            <p className="mt-1 text-sm text-fg-muted text-balance" data-testid="ship-credit">{credit}</p>
            <div className="mt-6 grid gap-2">
              {/* Capture phase: TryAppButton opens the tab synchronously, then the overlay closes. */}
              <div onClickCapture={() => setTimeout(() => close(false), 0)}>
                <TryAppButton code={code} url={agent.previewUrl} size="lg" className="w-full" data-testid="ship-try">
                  Try the new version
                </TryAppButton>
              </div>
              <Button variant="ghost" size="lg" className="w-full" onClick={() => close(true)} data-testid="ship-rate">
                <Star className="h-4 w-4" aria-hidden /> Rate it
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
