"use client";

import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { Check, ThumbsDown, ThumbsUp, Users, X } from "lucide-react";
import type { PublicProposal } from "@crowdship/shared";
import { Badge } from "@/components/ui/badge";
import { LocationPreview } from "@/components/location-preview";
import { api, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useRoomCtx } from "../room-shell";

const DECK_SIZE = 12;
const THRESHOLD = 110;

/** Ideas phase: swipe 👍/👎 on each approved idea. Approval shortlists the final vote. */
export function SwipeDeck() {
  const { state, setState, code, refetch } = useRoomCtx();
  const [error, setError] = useState<string | null>(null);
  // Swipes go out one at a time, in order, so a quick swipe-then-change-of-mind ends on the last answer.
  const chain = useRef<Promise<void>>(Promise.resolve());
  // This device's answers win over server state: a refetch that raced a swipe must not bring a card back.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  if (!state?.round) return null;
  const round = state.round;
  const mine = { ...(state.me?.swipes ?? {}), ...local };
  const approved = state.proposals.filter((p) => p.status === "approved");
  // Least-swiped ideas first, so every idea gets seen.
  const deck = approved
    .filter((p) => !(p.id in mine))
    .sort((a, b) => a.approval.likes + a.approval.dislikes - (b.approval.likes + b.approval.dislikes))
    .slice(0, DECK_SIZE);
  const done = approved.length - deck.length;

  async function swipe(p: PublicProposal, liked: boolean) {
    setError(null);
    const prev = mine[p.id];
    setLocal((l) => ({ ...l, [p.id]: liked }));
    setState((s) => s && {
      ...s,
      me: s.me && { ...s.me, swipes: { ...s.me.swipes, [p.id]: liked } },
      proposals: s.proposals.map((x) => x.id !== p.id ? x : {
        ...x,
        approval: {
          likes: x.approval.likes + (liked ? 1 : 0) - (prev === true ? 1 : 0),
          dislikes: x.approval.dislikes + (liked ? 0 : 1) - (prev === false ? 1 : 0),
        },
      }),
    });
    const roundId = round.id;
    chain.current = chain.current.then(async () => {
      try {
        await api(`/api/rooms/${code}/swipe`, { roundId, proposalId: p.id, liked });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't save that, please try again");
        setLocal((l) => {
          const { [p.id]: _drop, ...rest } = l;
          return rest;
        });
        await refetch();
      }
    });
    await chain.current;
  }

  if (!approved.length) {
    return (
      <div className="space-y-2 pt-8 text-center" data-testid="deck-empty">
        <p className="text-4xl">🃏</p>
        <h1 className="text-xl font-semibold">No ideas to swipe yet</h1>
        <p className="text-fg-muted">As soon as ideas are grouped and approved, they&apos;ll show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Swipe the ideas</h1>
          <p className="text-sm text-fg-muted">Right if you want it, left if you don&apos;t. The favourites go to the final vote.</p>
        </div>
        <p className="shrink-0 text-sm tabular text-fg-subtle" data-testid="deck-progress">{done}/{approved.length}</p>
      </div>
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}

      {deck.length > 0 ? (
        <>
          {/* Card height follows the screen so the buttons stay above the tab bar on short phones. */}
          <div className="relative h-[clamp(300px,calc(100dvh-340px),460px)]" data-testid="swipe-deck">
            <AnimatePresence initial={false}>
              {deck.slice(0, 2).reverse().map((p, i, arr) => (
                <SwipeCard key={p.id} proposal={p} top={i === arr.length - 1} appUrl={state.room.productionUrl} onSwipe={(liked) => swipe(p, liked)} />
              ))}
            </AnimatePresence>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => swipe(deck[0]!, false)} data-testid="swipe-no"
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-danger/40 bg-danger-soft text-danger font-semibold active:scale-[0.98]">
              <ThumbsDown className="h-5 w-5" aria-hidden /> Not for me
            </button>
            <button onClick={() => swipe(deck[0]!, true)} data-testid="swipe-yes"
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-success/40 bg-success-soft text-success font-semibold active:scale-[0.98]">
              <ThumbsUp className="h-5 w-5" aria-hidden /> Yes please
            </button>
          </div>
        </>
      ) : (
        <SwipeSummary approved={approved} mine={mine} onFlip={(p) => swipe(p, !mine[p.id])} />
      )}
    </div>
  );
}

function SwipeCard({ proposal: p, top, appUrl, onSwipe }: { proposal: PublicProposal; top: boolean; appUrl: string | null; onSwipe: (liked: boolean) => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-14, 14]);
  const yes = useTransform(x, [20, THRESHOLD], [0, 1]);
  const no = useTransform(x, [-THRESHOLD, -20], [1, 0]);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);

  async function fling(dir: 1 | -1) {
    setLeaving(dir);
    await animate(x, dir * 520, { duration: 0.25, ease: "easeIn" });
    onSwipe(dir === 1);
  }

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") void fling(1);
      if (e.key === "ArrowLeft") void fling(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  return (
    <motion.article
      className={cn("absolute inset-0 flex flex-col gap-3 overflow-hidden rounded-3xl border border-line bg-[oklch(0.22_0.045_285)] p-5 shadow-[0_20px_60px_-20px_oklch(0.2_0.1_290/0.8)]", top ? "cursor-grab active:cursor-grabbing" : "pointer-events-none")}
      style={{ x, rotate, zIndex: top ? 2 : 1 }}
      initial={{ scale: 0.94, y: 14, opacity: 0.6 }}
      animate={{ scale: top ? 1 : 0.94, y: top ? 0 : 14, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      drag={top && !leaving ? "x" : false}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={(_e: unknown, info: PanInfo) => {
        if (info.offset.x > THRESHOLD || info.velocity.x > 600) void fling(1);
        else if (info.offset.x < -THRESHOLD || info.velocity.x < -600) void fling(-1);
      }}
      data-testid={top ? "swipe-card" : undefined}
      data-proposal-id={p.id}
      aria-label={top ? `Idea: ${p.title}. Swipe right for yes, left for no.` : undefined}
    >
      <motion.span style={{ opacity: yes }} className="pointer-events-none absolute right-5 top-5 z-10 rotate-12 rounded-lg border-2 border-success px-2 py-0.5 text-lg font-black text-success">YES</motion.span>
      <motion.span style={{ opacity: no }} className="pointer-events-none absolute left-5 top-5 z-10 -rotate-12 rounded-lg border-2 border-danger px-2 py-0.5 text-lg font-black text-danger">NOPE</motion.span>

      <LocationPreview location={p.location} appUrl={appUrl} live={top} height={140} />
      <div className="min-h-0 flex-1">
        <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance">{p.title}</h2>
        {p.description && <p className="mt-2 line-clamp-4 text-fg-muted">{p.description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge><Users className="h-3 w-3" aria-hidden /> {p.supporters} suggested</Badge>
        {p.complexity !== "unknown" && <Badge>{p.complexity}</Badge>}
        {!p.location && <Badge tone="neutral">No specific spot</Badge>}
      </div>
    </motion.article>
  );
}

function SwipeSummary({ approved, mine, onFlip }: { approved: PublicProposal[]; mine: Record<string, boolean>; onFlip: (p: PublicProposal) => void }) {
  return (
    <div className="space-y-3" data-testid="swipe-summary">
      <div className="rounded-2xl border border-success/30 bg-success-soft p-4 text-center">
        <p className="text-2xl">🎉</p>
        <p className="font-semibold">You&apos;ve swiped every idea</p>
        <p className="text-sm text-fg-muted">The top ideas go to a quick final vote. Tap one to change your mind.</p>
      </div>
      <ul className="space-y-2">
        {approved.map((p) => (
          <li key={p.id}>
            <button onClick={() => onFlip(p)} data-testid="swipe-flip" data-proposal-id={p.id}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg-raised px-4 py-3 text-left text-sm backdrop-blur-md">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", mine[p.id] ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                {mine[p.id] ? <Check className="h-4 w-4" aria-label="Yes" /> : <X className="h-4 w-4" aria-label="No" />}
              </span>
              <span className="flex-1">{p.title}</span>
              <span className="text-xs tabular text-fg-subtle">{p.approval.likes}👍</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
