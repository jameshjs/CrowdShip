"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bot, ExternalLink, GitPullRequest, Eye, MessageSquare, Lightbulb, Users, Vote, Wifi, WifiOff, Star } from "lucide-react";
import { PROVIDER_LABELS } from "@crowdship/shared";
import { useRoom } from "@/lib/client/use-room";
import { ActivityRow } from "@/components/activity";
import { agentStateLabel, CheckIcon, Countdown, DemoModeBadge, Pipeline, roundStatusLabel, useNow } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { SailMark } from "@/components/brand";
import { ShippedBanner } from "./shipped-banner";
import { cn } from "@/lib/utils";

export function LiveDashboard({ code, qrSvg, joinUrl }: { code: string; qrSvg: string; joinUrl: string }) {
  const { state, online, status, serverNow } = useRoom(code);
  const now = useNow(1000, serverNow);
  if (!state) return <div className="grid min-h-dvh place-items-center text-fg-muted">Connecting…</div>;
  const { round, agent } = state;
  const ballot = round ? state.proposals.filter((p) => round.proposalIds.includes(p.id)) : [];
  const ranked = (ballot.length ? ballot : state.proposals.filter((p) => p.status === "approved"))
    .slice()
    .sort((a, b) => b.votes - a.votes || b.supporters - a.supporters)
    .slice(0, 5);
  const maxVotes = Math.max(1, ...ranked.map((p) => p.votes));
  const winner = state.proposals.find((p) => p.id === round?.winningProposalId);
  const totalReviews = state.reviews.yes + state.reviews.no + state.reviews.needs_improvement;

  return (
    <div className="bg-grid min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1800px] flex-col gap-5 p-6 lg:p-8">
        {/* header */}
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <SailMark className="h-14 w-14" />
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-fg-subtle"><span className="text-brand-gradient font-semibold">CrowdShip</span> live</p>
              <h1 className="text-3xl font-bold tracking-tight">{state.room.projectName}</h1>
            </div>
            {state.room.demoMode && <DemoModeBadge className="ml-2 text-sm" />}
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-sm text-fg-muted">Scan to join, or go to</p>
              <p className="font-mono text-lg">{joinUrl.replace(/^https?:\/\//, "")}</p>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-fg-subtle">
                {status === "live" ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5 text-warn" />}
                {status === "live" ? "Live" : "Reconnecting…"}
              </p>
            </div>
            <div className="h-28 w-28 overflow-hidden rounded-xl bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label={`QR code for ${joinUrl}`} />
          </div>
        </header>

        {/* stats */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat icon={Users} label="Online now" value={online ?? 0} sub={`${state.stats.participants} joined`} testId="live-online" />
          <Stat icon={MessageSquare} label="Feedback" value={state.stats.feedback} testId="live-feedback" />
          <Stat icon={Lightbulb} label="Proposals" value={state.stats.proposals} />
          <Stat icon={Vote} label={`Round ${round?.number ?? 1}`} value={round ? roundStatusLabel[round.status] : "—"} small />
          <div className="glass rounded-2xl border border-line p-5">
            <p className="text-sm text-fg-muted">Voting</p>
            {round?.status === "voting" && round.endsAt ? (
              <Countdown endsAt={round.endsAt} now={now} className="mt-1 block text-5xl font-semibold" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-fg-subtle">{round?.status === "selected" || (round && round.closedAt) ? "Closed" : "Not open"}</p>
            )}
          </div>
        </section>

        <ShippedBanner state={state} />

        {/* pipeline */}
        <section className="glass rounded-2xl border border-line p-5">
          <Pipeline status={round?.status ?? null} agent={agent} large />
        </section>

        <section className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.1fr_1fr_0.9fr]">
          {/* proposals */}
          <div className="glass flex flex-col rounded-2xl border border-line p-5">
            <h2 className="mb-4 text-sm uppercase tracking-[0.15em] text-fg-subtle">{winner ? "Winner" : "Leading proposals"}</h2>
            {winner ? (
              <div className="space-y-3">
                <p className="text-4xl font-semibold leading-tight text-balance">{winner.title}</p>
                <p className="text-lg text-fg-muted">{winner.description}</p>
                <ul className="mt-2 space-y-1.5 text-fg-muted">
                  {winner.requirements.slice(0, 4).map((r) => <li key={r}>• {r}</li>)}
                </ul>
                <p className="pt-2 text-fg-subtle tabular">{winner.votes} {winner.votes === 1 ? "vote" : "votes"} · {winner.supporters} {winner.supporters === 1 ? "person" : "people"} suggested it</p>
              </div>
            ) : (
              <ul className="space-y-4">
                <AnimatePresence initial={false}>
                  {ranked.map((p, i) => (
                    <motion.li key={p.id} layout transition={{ type: "spring", stiffness: 200, damping: 26 }} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-xl font-medium"><span className="mr-2 font-mono text-fg-subtle">{i + 1}</span>{p.title}</p>
                        <span className="text-2xl font-semibold tabular">{p.votes}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-bg-sunken">
                        <motion.div className="h-full rounded-full bg-brand-gradient" initial={false} animate={{ width: `${(p.votes / maxVotes) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {!ranked.length && <p className="text-fg-subtle">Waiting for ideas…</p>}
              </ul>
            )}
          </div>

          {/* agent */}
          <div className="glass flex flex-col gap-4 rounded-2xl border border-line p-5">
            <h2 className="text-sm uppercase tracking-[0.15em] text-fg-subtle">Agent execution</h2>
            {agent ? (
              <>
                <div className="flex items-center gap-3">
                  <span className={cn("grid h-12 w-12 place-items-center rounded-xl", agent.state === "failed" ? "bg-danger-soft text-danger" : agent.provider === "mock" ? "bg-demo-soft text-demo" : "bg-info-soft text-info")}>
                    <Bot className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xl font-semibold">{PROVIDER_LABELS[agent.provider]}</p>
                    <p className={cn("text-fg-muted", agent.state === "failed" && "text-danger")} data-testid="live-agent-state">
                      {agentStateLabel[agent.state]}{agent.statusDetail ? ` · ${agent.statusDetail}` : ""}
                    </p>
                  </div>
                </div>
                {agent.error && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{agent.error}</p>}
                {agent.prUrl ? (
                  <a href={agent.prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line bg-bg-sunken p-3 hover:border-line-strong">
                    <GitPullRequest className="h-5 w-5 text-info" />
                    <span className="flex-1">
                      <span className="block font-medium">Draft PR #{agent.prNumber}</span>
                      <span className="font-mono text-xs text-fg-subtle">{state.room.repository} @ {agent.headSha?.slice(0, 7)}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-fg-subtle" />
                  </a>
                ) : agent.verification?.simulated ? (
                  <p className="rounded-xl border border-dashed border-demo/40 p-3 text-demo">Simulated pull request (demo mode, nothing was pushed)</p>
                ) : (
                  <p className="rounded-xl border border-dashed border-line p-3 text-fg-subtle">No pull request yet</p>
                )}
                <div>
                  <p className="mb-2 text-sm text-fg-muted">Verification{agent.verification?.simulated && <span className="ml-2 text-demo">(simulated checks)</span>}</p>
                  {agent.verification ? (
                    <ul className="grid grid-cols-3 gap-2">
                      {agent.verification.checks.length ? agent.verification.checks.map((c) => (
                        <li key={c.name} className={cn("flex items-center gap-2 rounded-xl border p-3 font-mono text-sm",
                          c.status === "pass" ? "border-success/40" : c.status === "fail" ? "border-danger/40" : "border-line")}>
                          <CheckIcon status={c.status} /> {c.name}
                        </li>
                      )) : <li className="col-span-3 text-fg-subtle">Waiting for checks to start…</li>}
                    </ul>
                  ) : (
                    <p className="text-fg-subtle">Not started</p>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-3 rounded-xl border border-line bg-bg-sunken p-3">
                  <Eye className={cn("h-5 w-5", agent.previewReleased ? "text-accent" : "text-fg-subtle")} />
                  <span className="flex-1">{agent.previewReleased ? "Preview available. Try version B on your phone!" : "Preview not released"}</span>
                  {totalReviews > 0 && (
                    <span className="flex items-center gap-3 text-sm tabular">
                      <Star className="h-4 w-4 text-warn" /> 👍 {state.reviews.yes} · 👎 {state.reviews.no} · 🔧 {state.reviews.needs_improvement}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-fg-subtle">The winning proposal will be dispatched to {PROVIDER_LABELS[state.room.provider]} after the organizer approves it.</p>
            )}
          </div>

          {/* activity */}
          <div className="glass flex min-h-0 flex-col rounded-2xl border border-line p-5">
            <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-fg-subtle">Live activity</h2>
            <ul className="min-h-0 flex-1 divide-y divide-line/50 overflow-hidden" data-testid="live-activity">
              <AnimatePresence initial={false}>
                {state.activity.slice(0, 12).map((a) => (
                  <motion.div key={a.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    <ActivityRow a={a} now={now} large />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </section>

        {state.history.length > 0 && (
          <footer className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
            <span className="uppercase tracking-[0.15em] text-fg-subtle">History</span>
            {state.history.map((h) => (
              <Badge key={h.roundNumber} tone={h.status === "completed" ? "success" : h.status === "failed" ? "danger" : "neutral"}>
                R{h.roundNumber} · {h.title} · {roundStatusLabel[h.status]}
              </Badge>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, small, testId }: { icon: React.ElementType; label: string; value: number | string; sub?: string; small?: boolean; testId?: string }) {
  return (
    <div className="glass rounded-2xl border border-line p-5">
      <p className="flex items-center gap-2 text-sm text-fg-muted"><Icon className="h-4 w-4" aria-hidden /> {label}</p>
      <motion.p key={String(value)} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-1 font-semibold tabular", small ? "text-2xl" : "text-5xl")} data-testid={testId}>
        {value}
      </motion.p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}
