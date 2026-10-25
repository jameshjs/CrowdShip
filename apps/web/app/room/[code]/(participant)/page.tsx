"use client";

import Link from "next/link";
import { ChevronRight, GitPullRequest, MessageSquarePlus, Vote } from "lucide-react";
import { creditLine, type PublicAgentSession, type PublicRoomState } from "@crowdship/shared";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ActivityRow } from "@/components/activity";
import { CheckIcon, Countdown, useNow } from "@/components/status";
import { Journey } from "@/components/journey";
import { TryAppButton } from "@/components/try-app";
import { PreviewReview } from "./preview-review";
import { useRoomCtx } from "./room-shell";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { state, code, serverNow, error } = useRoomCtx();
  const now = useNow(1000, serverNow);
  if (!state) return <p className="text-fg-muted">{error ?? "Loading…"}</p>;
  const { round, agent } = state;
  const winner = state.proposals.find((p) => p.id === round?.winningProposalId);
  const released = Boolean(agent?.previewReleased && agent.previewUrl);
  const feedbackMode = state.room.mode === "feedback";
  const status = feedbackMode ? feedbackStatusCopy(state, winner?.title ?? null) : statusCopy(state, winner?.title ?? null);
  const lastResult = feedbackMode ? state.history.find((h) => h.status === "completed") : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">Hi {state.me?.nickname} 👋</p>

      <Card className="space-y-4 p-5" data-testid="status-card">
        <Journey status={round?.status ?? null} previewReleased={released} mode={state.room.mode} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-balance">{status.title}</h1>
          <p className="mt-1 text-fg-muted text-balance">
            {round?.status === "voting" && round.endsAt ? (
              <>Ends in <Countdown endsAt={round.endsAt} now={now} className="font-semibold text-fg" />. {status.sub}</>
            ) : status.sub}
          </p>
        </div>
        {status.cta === "feedback" && (
          <Link href={`/room/${code}/feedback`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            <MessageSquarePlus className="h-5 w-5" aria-hidden /> Give feedback
          </Link>
        )}
        {status.cta === "vote" && (
          <Link href={`/room/${code}/vote`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            <Vote className="h-5 w-5" aria-hidden /> {state.me?.vote ? "Change your vote" : "Vote now"}
          </Link>
        )}
        {state.room.productionUrl && !released && (status.cta === "feedback" || status.cta === "none") && (
          <TryAppButton code={code} url={state.room.productionUrl} external={feedbackMode} variant="secondary" size="lg" className="w-full">
            {feedbackMode ? "Open the website" : "Try the app"}
          </TryAppButton>
        )}
      </Card>

      {lastResult && round?.status !== "selected" && (
        <Card className="flex items-center gap-3 p-4" data-testid="last-result">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-soft text-xl" aria-hidden>🏆</span>
          <p className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-fg-subtle">Round {lastResult.roundNumber} result</span>
            <span className="font-semibold">&ldquo;{lastResult.title}&rdquo;</span> was the crowd&apos;s top pick. Results went to the site&apos;s team.
          </p>
        </Card>
      )}

      {released && agent?.previewUrl && winner && (
        <div id="preview-review" className="scroll-mt-24">
          <PreviewReview code={code} proposalId={winner.id} previewUrl={agent.previewUrl} productionUrl={state.room.productionUrl} current={state.me?.previewRating ?? null} />
        </div>
      )}

      {agent && <BuildDetails agent={agent} />}

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wide text-fg-subtle">Latest</h2>
          <Link href={`/room/${code}/activity`} className="flex items-center text-xs text-fg-subtle hover:text-fg">
            See all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <ul className="divide-y divide-line/60" data-testid="activity-feed">
          {state.activity.slice(0, 4).map((a) => <ActivityRow key={a.id} a={a} now={now} />)}
          {!state.activity.length && <li className="py-2 text-sm text-fg-subtle">Nothing yet. Be the first to share an idea.</li>}
        </ul>
      </section>
    </div>
  );
}

type Cta = "feedback" | "vote" | "none";

/** One plain-language headline and one next action for every stage of the round. */
function statusCopy(state: PublicRoomState, winner: string | null): { title: string; sub: string; cta: Cta } {
  const { round, agent } = state;
  const credit = state.credits ? `Built from ideas by ${creditLine(state.credits)}.` : "The crowd voted. The AI built it.";
  switch (round?.status) {
    case "voting":
      return { title: "Voting is open", sub: "Pick what gets built next.", cta: "vote" };
    case "selected":
      return { title: winner ? `"${winner}" won!` : "We have a winner!", sub: "Waiting for the organizer to start the build.", cta: "none" };
    case "developing":
    case "verifying":
      return { title: winner ? `Building "${winner}"` : "Building the winner", sub: buildSub(agent, round.status), cta: "none" };
    case "review_ready":
      return agent?.previewReleased
        ? { title: "It's live. Try it!", sub: credit, cta: "none" }
        : { title: "Built and tested ✅", sub: "The new version is being prepared for you to try.", cta: "none" };
    case "completed":
      return { title: "Shipped! 🎉", sub: "Next round starts soon. Keep the ideas coming.", cta: "feedback" };
    case "failed":
    case "cancelled":
      return { title: "This round was stopped", sub: "A new round will start soon. Your ideas still count.", cta: "feedback" };
    default:
      return { title: "Share your ideas", sub: "Try the app, then tell us what to fix or build. Similar ideas get grouped for voting.", cta: "feedback" };
  }
}

/** Feedback-only rooms: no build. The round ends with the organizer publishing results. */
function feedbackStatusCopy(state: PublicRoomState, winner: string | null): { title: string; sub: string; cta: Cta } {
  switch (state.round?.status) {
    case "voting":
      return { title: "Voting is open", sub: "Pick the change the site needs most.", cta: "vote" };
    case "selected":
      return { title: winner ? `"${winner}" is the top pick!` : "Voting is closed", sub: "The organizer is publishing the results for the site's team.", cta: "none" };
    case "cancelled":
      return { title: "This round was stopped", sub: "A new round will start soon. Your ideas still count.", cta: "feedback" };
    default:
      return { title: "What would make this site better?", sub: "Browse the site, then tell us what to fix or add. Similar ideas get grouped for voting.", cta: "feedback" };
  }
}

function buildSub(agent: PublicAgentSession | null, status: "developing" | "verifying"): string {
  if (agent?.state === "failed") return "The build hit a problem. The organizer is on it.";
  if (status === "verifying" || agent?.state === "pr_opened" || agent?.state === "finished") return "Running the tests on the new version…";
  if (agent?.state === "running") return "The AI is writing the code…";
  return "Starting the AI agent…";
}

/** The engineering detail (PR, checks) is still there for the curious, folded away. */
function BuildDetails({ agent }: { agent: PublicAgentSession }) {
  const checks = agent.verification?.checks ?? [];
  if (!agent.prUrl && !checks.length) return null;
  return (
    <details className="group rounded-2xl border border-line bg-bg-raised px-4 py-3 text-sm backdrop-blur-md">
      <summary className="flex cursor-pointer list-none items-center justify-between text-fg-muted">
        Build details
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="mt-3 space-y-2">
        {agent.prUrl && (
          <a href={agent.prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-info underline-offset-2 hover:underline">
            <GitPullRequest className="h-4 w-4" aria-hidden /> Draft PR #{agent.prNumber}
          </a>
        )}
        {checks.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {checks.map((c) => (
              <li key={c.name} className="flex items-center gap-1 font-mono text-xs"><CheckIcon status={c.status} /> {c.name}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
