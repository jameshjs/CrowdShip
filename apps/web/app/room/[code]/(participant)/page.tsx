"use client";

import Link from "next/link";
import { MessageSquarePlus, Users, Vote, Trophy, GitPullRequest } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { agentStateLabel, CheckIcon, Countdown, Pipeline, roundStatusLabel, useNow } from "@/components/status";
import { TryAppButton } from "@/components/try-app";
import { PreviewReview } from "./preview-review";
import { useRoomCtx } from "./room-shell";
import { cn } from "@/lib/utils";

export default function ExplorePage() {
  const { state, online, code, serverNow, error } = useRoomCtx();
  const now = useNow(1000, serverNow);
  if (!state) return <p className="text-fg-muted">{error ?? "Loading…"}</p>;
  const { round, agent } = state;
  const ballot = state.proposals.filter((p) => round?.proposalIds.includes(p.id));
  const leader = [...ballot].sort((a, b) => b.votes - a.votes)[0];
  const winner = state.proposals.find((p) => p.id === round?.winningProposalId);

  return (
    <div className="space-y-4">
      <section>
        <p className="text-sm text-fg-muted">Hi {state.me?.nickname} 👋</p>
        {state.room.description && <p className="mt-1 text-fg-muted">{state.room.description}</p>}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-fg-subtle">Round {round?.number ?? 1}</p>
          <p className="mt-1 font-medium">{round ? roundStatusLabel[round.status] : "Starting"}</p>
          {round?.status === "voting" && round.endsAt && (
            <p className="mt-1 text-sm text-fg-muted">ends in <Countdown endsAt={round.endsAt} now={now} /></p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-fg-subtle">People here</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular" data-testid="online-count">
            <Users className="h-5 w-5 text-accent" aria-hidden /> {online ?? state.stats.participants}
          </p>
        </Card>
      </div>

      <div className="grid gap-2">
        {state.room.productionUrl && (
          <TryAppButton code={code} url={state.room.productionUrl} size="lg" variant="secondary" className="w-full justify-between">
            Try the app
          </TryAppButton>
        )}
        <Link href={`/room/${code}/feedback`} className={cn(buttonVariants({ size: "lg" }), "w-full justify-between")}>
          Give feedback <MessageSquarePlus className="h-4 w-4" />
        </Link>
        <Link href={`/room/${code}/vote`} className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "w-full justify-between")}>
          Vote on ideas <Vote className="h-4 w-4" />
        </Link>
      </div>

      {(winner || leader) && (
        <Card className="p-4">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-fg-subtle">
            <Trophy className="h-3.5 w-3.5" aria-hidden /> {winner ? "Winning proposal" : "Currently leading"}
          </p>
          <p className="mt-1 text-lg font-semibold">{(winner ?? leader)!.title}</p>
          <p className="text-sm text-fg-muted tabular">{(winner ?? leader)!.votes} votes</p>
        </Card>
      )}

      <Card className="p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-fg-subtle">Development progress</p>
        <Pipeline status={round?.status ?? null} agent={agent} vertical />
        {agent && (
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-fg-muted">Agent</span>
              <Badge tone={agent.state === "failed" ? "danger" : agent.provider === "mock" ? "demo" : "info"}>{agentStateLabel[agent.state]}</Badge>
            </div>
            {agent.prUrl && (
              <a href={agent.prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-info underline-offset-2 hover:underline">
                <GitPullRequest className="h-4 w-4" aria-hidden /> Draft PR #{agent.prNumber}
              </a>
            )}
            {agent.verification && (
              <ul className="flex flex-wrap gap-3">
                {agent.verification.checks.map((c) => (
                  <li key={c.name} className="flex items-center gap-1 font-mono text-xs"><CheckIcon status={c.status} /> {c.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {agent?.previewReleased && agent.previewUrl && winner && (
        <PreviewReview code={code} proposalId={winner.id} previewUrl={agent.previewUrl} productionUrl={state.room.productionUrl} current={state.me?.previewRating ?? null} />
      )}
    </div>
  );
}
