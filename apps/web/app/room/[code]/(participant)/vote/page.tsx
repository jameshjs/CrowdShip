"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Countdown, roundStatusLabel, useNow } from "@/components/status";
import { api, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useRoomCtx } from "../room-shell";
import { SwipeDeck } from "./swipe-deck";

export default function VotePage() {
  const { state, setState, code, serverNow, refetch } = useRoomCtx();
  const now = useNow(1000, serverNow);
  const [error, setError] = useState<string | null>(null);
  // Votes are sent one at a time, in tap order, so the server ends on the last choice.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const inflight = useRef(0);
  if (!state) return <p className="text-fg-muted">Loading…</p>;

  const round = state.round;
  const open = round?.status === "voting" && round.endsAt != null && new Date(round.endsAt).getTime() > now;
  const ballot = round ? state.proposals.filter((p) => round.proposalIds.includes(p.id)) : [];
  const total = ballot.reduce((n, p) => n + p.votes, 0);
  const myVote = state.me?.vote ?? null;

  function vote(proposalId: string) {
    if (!round || !open || proposalId === myVote) return;
    setError(null);
    // Optimistic: move my vote and adjust counts locally right away.
    setState((s) =>
      s && {
        ...s,
        me: s.me && { ...s.me, vote: proposalId },
        proposals: s.proposals.map((p) =>
          p.id === proposalId ? { ...p, votes: p.votes + 1 } : p.id === myVote ? { ...p, votes: Math.max(0, p.votes - 1) } : p,
        ),
      },
    );
    inflight.current++;
    const roundId = round.id;
    chain.current = chain.current.then(async () => {
      try {
        const res = await api<{ tallies: Record<string, number> }>(`/api/rooms/${code}/vote`, { roundId, proposalId });
        // Only the latest request's tallies reflect what the user sees.
        if (inflight.current === 1) {
          setState((s) => s && { ...s, proposals: s.proposals.map((p) => (p.id in res.tallies ? { ...p, votes: res.tallies[p.id]! } : p)) });
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Vote failed, please try again");
        await refetch(); // roll back to canonical server state
      } finally {
        inflight.current--;
      }
    });
  }

  if (round && (round.status === "collecting" || round.status === "triaging")) return <SwipeDeck />;

  if (!round || round.proposalIds.length === 0) {
    return (
      <div className="space-y-2 pt-8 text-center">
        <h1 className="text-xl font-semibold">Voting hasn&apos;t started yet</h1>
        <p className="text-fg-muted">Keep the ideas coming. The organizer will open a vote soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Round {round.number}</h1>
          <p className="text-sm text-fg-muted">{open ? "Pick what gets built next. You can change your vote." : roundStatusLabel[round.status]}</p>
        </div>
        {open && round.endsAt && (
          <div className="text-right">
            <p className="text-xs text-fg-subtle">ends in</p>
            <Countdown endsAt={round.endsAt} now={now} className="text-2xl font-semibold" />
          </div>
        )}
      </div>
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert" data-testid="vote-error">{error}</p>}
      <ul className="space-y-3">
        {ballot.map((p) => {
          const mine = myVote === p.id;
          const pct = total ? Math.round((p.votes / total) * 100) : 0;
          const winner = round.winningProposalId === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => vote(p.id)}
                disabled={!open}
                data-testid="vote-card"
                data-proposal-id={p.id}
                aria-pressed={mine}
                className={cn(
                  "relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-colors",
                  mine ? "border-accent bg-bg-raised" : winner ? "border-accent/60 bg-bg-raised" : "border-line bg-bg-raised",
                  open && !mine && "hover:border-line-strong",
                )}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 bg-accent-soft"
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 22 }}
                  aria-hidden
                />
                <div className="relative space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug">{p.title}</p>
                    <span className="shrink-0 text-right">
                      <span className="block text-xl font-semibold tabular" data-testid="vote-count">{p.votes}</span>
                      <span className="text-[11px] text-fg-subtle tabular">{pct}%</span>
                    </span>
                  </div>
                  {p.description && <p className="text-sm text-fg-muted line-clamp-2">{p.description}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge><Users className="h-3 w-3" aria-hidden /> {p.supporters} suggested</Badge>
                    <Badge>{p.complexity}</Badge>
                    {winner && <Badge tone="accent">Winner</Badge>}
                    {mine && (
                      <Badge tone="accent" data-testid="my-vote"><Check className="h-3 w-3" aria-hidden /> Your vote</Badge>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-xs text-fg-subtle tabular">{total} vote{total === 1 ? "" : "s"} cast</p>
    </div>
  );
}
