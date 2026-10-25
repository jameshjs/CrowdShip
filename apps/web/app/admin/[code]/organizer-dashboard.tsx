"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Bot, Check, ExternalLink, Eye, EyeOff, GitMerge, GitPullRequest, Pause, Play, RefreshCw, Scissors, Sparkles, Trash2, Trophy, X,
} from "lucide-react";
import { approvalScore, PROVIDER_LABELS, type AgentProviderName, type CheckStatus, type Complexity, type ProposalStatus, type PublicAgentSession, type QueueName, type RoundStatus } from "@crowdship/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { agentStateLabel, CheckIcon, Countdown, DemoModeBadge, Pipeline, roundStatusLabel, useNow } from "@/components/status";
import { useRoom } from "@/lib/client/use-room";
import { api } from "@/lib/client/api";
import { QrButton } from "@/components/big-qr";
import { cn, timeAgo } from "@/lib/utils";

type Proposal = {
  id: string; title: string; description: string; status: ProposalStatus; complexity: Complexity; needs_review: boolean;
  requirements_json: string[]; acceptance_criteria_json: string[]; missing_details_json: string[]; supporters: number; source: string;
};
type Feedback = {
  id: string; type: string; text: string; nickname: string; moderation: "visible" | "held" | "hidden"; proposal_id: string | null;
  confidence: number | null; element_label: string | null; page_url: string | null; created_at: string; triaged_at: string | null;
  region: { x: number; y: number; w: number; h: number; pageW: number; pageH: number; points: [number, number][] } | null;
};
type AdminState = {
  room: { code: string; projectName: string; repository: string | null; mode: "build" | "feedback"; productionUrl: string | null; provider: AgentProviderName; maxAcuPerSession: number; maxSessionsTotal: number; agentPaused: boolean };
  round: { id: string; number: number; status: RoundStatus; ends_at: string | null; winning_proposal_id: string | null } | null;
  roundProposalIds: string[];
  tallies: Record<string, number>;
  approvals: Record<string, { likes: number; dislikes: number }>;
  feedback: Feedback[];
  proposals: Proposal[];
  agent: (PublicAgentSession & { previewUrl: string | null; githubIssueNumber: number | null; providerSessionId: string | null }) | null;
  sessions: { id: string; provider: string; state: string; error: string | null; created_at: string }[];
  reviews: { rating: string; comment: string; nickname: string; created_at: string }[];
  queues: { queue: QueueName; paused: boolean; queued: number; running: number; dead: number }[];
  deadJobs: { id: string; queue: string; attempts: number; lastError: string | null; createdAt: string }[];
  audit: { actor: string; action: string; created_at: string }[];
};

export function OrganizerDashboard({ code, qrSvg, joinUrl }: { code: string; qrSvg: string; joinUrl: string }) {
  const live = useRoom(code);
  const now = useNow(1000, live.serverNow);
  const [s, setS] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setS(await api<AdminState>(`/api/admin/rooms/${code}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [code]);

  // Public state changes (broadcast hints) trigger an admin refetch; plus a slow poll for queue/audit data.
  useEffect(() => void load(), [load, live.state]);
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = useCallback(async (body: Record<string, unknown>, label = String(body.type)) => {
    setBusy(label);
    setError(null);
    try {
      const res = await api<Record<string, unknown>>(`/api/admin/rooms/${code}/action`, body);
      await load();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }, [code, load]);

  if (!s) return <div className="p-10 text-fg-muted">{error ?? "Loading…"}</div>;
  const round = s.round;
  const feedbackMode = s.room.mode === "feedback";
  const demo = !feedbackMode && s.room.provider === "mock";

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-fg-subtle hover:text-fg">← Sessions</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {s.room.projectName} <span className="font-mono text-accent">{code}</span>
            {feedbackMode ? <Badge tone="success">Feedback only</Badge> : demo ? <DemoModeBadge /> : <Badge tone="info">{PROVIDER_LABELS[s.room.provider]}</Badge>}
          </h1>
          <p className="font-mono text-sm text-fg-subtle">{feedbackMode ? s.room.productionUrl : s.room.repository}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            <a href={`/room/${code}/live`} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm">Open live dashboard <ExternalLink className="h-3.5 w-3.5" /></Button></a>
            <a href={joinUrl} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm">Participant view <ExternalLink className="h-3.5 w-3.5" /></Button></a>
          </div>
          <QrButton qrSvg={qrSvg} joinUrl={joinUrl} code={code} className="h-24 w-24" />
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card className="p-4"><Pipeline status={round?.status ?? null} agent={s.agent} mode={s.room.mode} /></Card>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <RoundPanel s={s} now={now} act={act} busy={busy} />
          <ProposalsPanel s={s} act={act} busy={busy} />
          <FeedbackPanel s={s} act={act} />
        </div>
        <div className="space-y-5">
          {!feedbackMode && <AgentPanel s={s} act={act} busy={busy} />}
          <ReportPanel code={code} feedbackMode={feedbackMode} />
          {!feedbackMode && <SettingsPanel s={s} act={act} />}
          <QueuesPanel s={s} act={act} />
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Audit log</h2>
            <ul className="max-h-64 space-y-1 overflow-auto text-xs text-fg-muted">
              {s.audit.map((a, i) => <li key={i} className="flex justify-between gap-2"><span className="font-mono">{a.action}</span><span className="text-fg-subtle">{timeAgo(a.created_at, now)}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}

type Act = (body: Record<string, unknown>, label?: string) => Promise<Record<string, unknown> | undefined>;

// ---------------------------------------------------------------- round

function RoundPanel({ s, now, act, busy }: { s: AdminState; now: number; act: Act; busy: string | null }) {
  const round = s.round;
  const approval = (id: string) => s.approvals[id] ?? { likes: 0, dislikes: 0 };
  const swiped = Object.values(s.approvals).some((a) => a.likes + a.dislikes > 0);
  // With swipes in, rank by crowd approval and shortlist the top 3 for the final vote.
  const approved = s.proposals
    .filter((p) => p.status === "approved")
    .sort((a, b) => (swiped ? approvalScore(approval(b.id)) - approvalScore(approval(a.id)) : 0));
  const [picked, setPicked] = useState<string[] | null>(null);
  const [duration, setDuration] = useState(180);
  const selection = picked ?? (swiped ? approved.slice(0, 3) : approved).map((p) => p.id);
  const ballot = s.proposals.filter((p) => s.roundProposalIds.includes(p.id));
  const tallies = s.tallies;
  const top = Math.max(0, ...Object.values(tallies));
  const tied = round?.status === "selected" && !round.winning_proposal_id ? ballot.filter((p) => (tallies[p.id] ?? 0) === top) : [];
  const winner = s.proposals.find((p) => p.id === round?.winning_proposal_id);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Round {round?.number} · {round ? roundStatusLabel[round.status] : "—"}</h2>
        {round?.status === "voting" && round.ends_at && <span className="text-lg">⏱ <Countdown endsAt={round.ends_at} now={now} /></span>}
      </div>

      {(round?.status === "collecting" || round?.status === "triaging") && (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            {swiped ? "Top 3 by crowd approval are pre-selected for the final vote. Adjust if you like:" : "Pick approved proposals for the ballot (participants can swipe them first):"}
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {approved.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection.includes(p.id)}
                    onChange={(e) => setPicked(e.target.checked ? [...selection, p.id] : selection.filter((x) => x !== p.id))}
                  />
                  <span className="flex-1">{p.title}</span>
                  {swiped ? (
                    <span className="text-xs tabular text-fg-subtle" data-testid="approval">
                      ▲ {approval(p.id).likes} · ▼ {approval(p.id).dislikes} · {Math.round((approval(p.id).likes / Math.max(1, approval(p.id).likes + approval(p.id).dislikes)) * 100)}%
                    </span>
                  ) : <span className="text-xs text-fg-subtle">{p.supporters}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-11 rounded-xl border border-line bg-bg-sunken px-3 text-sm" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[30, 60, 120, 180, 300, 600].map((d) => <option key={d} value={d}>{d < 60 ? `${d}s` : `${d / 60} min`}</option>)}
            </select>
            <Button onClick={() => act({ type: "start_voting", proposalIds: selection, durationSeconds: duration })} disabled={!selection.length || busy !== null} data-testid="start-voting">
              Start voting ({selection.length})
            </Button>
            <Button variant="secondary" onClick={() => act({ type: "run_triage" })} disabled={busy !== null}>
              <Sparkles className="h-4 w-4" /> Run triage now
            </Button>
          </div>
        </div>
      )}

      {round && round.status !== "collecting" && round.status !== "triaging" && ballot.length > 0 && (
        <ul className="space-y-1.5">
          {ballot.sort((a, b) => (tallies[b.id] ?? 0) - (tallies[a.id] ?? 0)).map((p) => (
            <li key={p.id} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm", p.id === round.winning_proposal_id ? "border-accent/60 bg-accent-soft" : "border-line")}>
              <span className="flex items-center gap-2">{p.id === round.winning_proposal_id && <Trophy className="h-4 w-4 text-accent" />}{p.title}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono tabular">{tallies[p.id] ?? 0}</span>
                {tied.some((t) => t.id === p.id) && <Button size="sm" variant="secondary" onClick={() => act({ type: "choose_winner", proposalId: p.id })}>Pick</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {round?.status === "voting" && <Button onClick={() => act({ type: "close_voting" })} disabled={busy !== null} data-testid="close-voting">Close voting now</Button>}
        {round?.status === "selected" && (
          <>
            <Button variant="secondary" onClick={() => act({ type: "reopen_voting", durationSeconds: 60 })} disabled={busy !== null}>Reopen voting (1 min)</Button>
            {winner && s.room.mode === "feedback" && (
              <Button onClick={() => act({ type: "publish_results" })} disabled={busy !== null} data-testid="publish-results">
                <Trophy className="h-4 w-4" /> Publish results
              </Button>
            )}
            {winner && s.room.mode === "build" && (
              <Button onClick={() => act({ type: "approve_development" }, "approve_development")} disabled={busy !== null} data-testid="approve-development">
                <Bot className="h-4 w-4" /> Approve &ldquo;{winner.title}&rdquo; for {PROVIDER_LABELS[s.room.provider]}
              </Button>
            )}
          </>
        )}
        {round?.status === "review_ready" && (
          <Button onClick={() => act({ type: "complete_round" })} disabled={busy !== null} data-testid="complete-round"><Check className="h-4 w-4" /> Confirm milestone &amp; close round</Button>
        )}
        {round && !["collecting", "completed", "failed", "cancelled"].includes(round.status) && (
          <Button variant="ghost" onClick={() => act({ type: "cancel_round" })} disabled={busy !== null}>Cancel round</Button>
        )}
        {round && ["developing", "verifying", "review_ready"].includes(round.status) && (
          <Button variant="danger" onClick={() => act({ type: "fail_round" })} disabled={busy !== null}>Mark failed</Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- report

function ReportPanel({ code, feedbackMode }: { code: string; feedbackMode: boolean }) {
  const base = `/api/admin/rooms/${code}/report`;
  return (
    <Card className="space-y-2 p-4" data-testid="report-panel">
      <h2 className="font-semibold">Results report</h2>
      <p className="text-sm text-fg-muted">
        {feedbackMode
          ? "Ranked proposals with votes, supporters and quotes. Send it to the site's team."
          : "Ranked proposals with votes, supporters and quotes from the latest vote."}
      </p>
      <div className="flex gap-2">
        <a href={`${base}?format=md`} download><Button size="sm" variant="secondary">Download Markdown</Button></a>
        <a href={`${base}?format=csv`} download><Button size="sm" variant="ghost">CSV</Button></a>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- agent

function AgentPanel({ s, act, busy }: { s: AdminState; act: Act; busy: string | null }) {
  const a = s.agent;
  const [previewUrl, setPreviewUrl] = useState("");
  const counts = { yes: 0, no: 0, needs_improvement: 0 } as Record<string, number>;
  for (const r of s.reviews) counts[r.rating] = (counts[r.rating] ?? 0) + 1;
  const verified = a?.verification?.ciStatus === "pass" && a.verification.testStatus === "pass";
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4" /> Agent session</h2>
      {!a ? (
        <p className="text-sm text-fg-subtle">No session yet. Close voting, then approve the winner.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={a.state === "failed" ? "danger" : a.provider === "mock" ? "demo" : "info"} data-testid="admin-agent-state">{agentStateLabel[a.state]}</Badge>
            <span className="text-fg-muted">{a.statusDetail}</span>
          </div>
          {a.error && <p className="rounded-lg bg-danger-soft p-2 text-sm text-danger">{a.error}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-fg-subtle">Provider</dt><dd>{PROVIDER_LABELS[a.provider]}</dd>
            <dt className="text-fg-subtle">Session</dt>
            <dd className="truncate font-mono text-xs">{a.providerUrl ? <a className="text-info hover:underline" href={a.providerUrl} target="_blank" rel="noreferrer">{a.providerSessionId}</a> : a.providerSessionId ?? "—"}</dd>
            <dt className="text-fg-subtle">Issue</dt><dd>{a.issueUrl ? <a className="text-info hover:underline" href={a.issueUrl} target="_blank" rel="noreferrer">#{a.githubIssueNumber}</a> : "—"}</dd>
            <dt className="text-fg-subtle">PR</dt>
            <dd>{a.prUrl ? <a className="inline-flex items-center gap-1 text-info hover:underline" href={a.prUrl} target="_blank" rel="noreferrer"><GitPullRequest className="h-3.5 w-3.5" />#{a.prNumber} @ {a.headSha?.slice(0, 7)}</a> : "—"}</dd>
          </dl>
          {a.verification && (
            <div className="rounded-lg border border-line p-2">
              <p className="mb-1 text-xs text-fg-subtle">Required checks on {a.verification.commitSha.slice(0, 7)}{a.verification.simulated && <span className="text-demo"> · simulated</span>}</p>
              <ul className="flex flex-wrap gap-3">
                {a.verification.checks.map((c) => <li key={c.name} className="flex items-center gap-1 font-mono text-xs"><CheckIcon status={c.status as CheckStatus} /> {c.name}</li>)}
                {!a.verification.checks.length && <li className="text-xs text-fg-subtle">waiting…</li>}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {["queued", "launching", "running", "pr_opened", "needs_reconcile"].includes(a.state) && (
              <Button size="sm" variant="danger" onClick={() => act({ type: "cancel_agent", agentSessionId: a.id })}>Cancel session</Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => act({ type: "reconcile_agent", agentSessionId: a.id })}><RefreshCw className="h-3.5 w-3.5" /> Poll provider</Button>
            {a.headSha && <Button size="sm" variant="secondary" onClick={() => act({ type: "recheck_verification", agentSessionId: a.id })}><RefreshCw className="h-3.5 w-3.5" /> Re-check CI</Button>}
            {(a.state === "failed" || a.state === "cancelled") && s.round?.status === "developing" && (
              <Button size="sm" onClick={() => act({ type: "approve_development" })} disabled={busy !== null}>Retry with a new session</Button>
            )}
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-sm font-medium">Preview (version B)</p>
            <p className="text-xs text-fg-subtle">Current: {a.previewUrl ? <a className="text-info hover:underline" href={a.previewUrl} target="_blank" rel="noreferrer">{a.previewUrl}</a> : "none detected"}</p>
            <div className="flex gap-2">
              <Input className="h-10 text-sm" placeholder="https://preview-url…" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} />
              <Button size="sm" variant="secondary" disabled={!previewUrl} onClick={() => act({ type: "set_preview_url", agentSessionId: a.id, previewUrl })}>Set</Button>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!verified || !a.previewUrl || a.previewReleased || busy !== null}
              onClick={() => act({ type: "release_preview", agentSessionId: a.id })}
              data-testid="release-preview"
            >
              <Eye className="h-4 w-4" /> {a.previewReleased ? "Released to testers" : verified ? "Release preview to testers" : "Release (needs passing checks)"}
            </Button>
          </div>
          {s.reviews.length > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-sm font-medium">Did this change improve the app?</p>
              <p className="text-sm tabular" data-testid="review-summary">▲ {counts.yes} · ▼ {counts.no} · 🔧 {counts.needs_improvement}</p>
              <ul className="max-h-40 space-y-1 overflow-auto text-xs text-fg-muted">
                {s.reviews.filter((r) => r.comment).map((r, i) => <li key={i}><span className="text-fg">{r.nickname}:</span> {r.comment}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- proposals

function ProposalsPanel({ s, act, busy }: { s: AdminState; act: Act; busy: string | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const groups: { label: string; items: Proposal[] }[] = [
    { label: "Needs review", items: s.proposals.filter((p) => p.status === "suggested" && p.needs_review) },
    { label: "Suggested by triage", items: s.proposals.filter((p) => p.status === "suggested" && !p.needs_review) },
    { label: "Approved for voting", items: s.proposals.filter((p) => p.status === "approved") },
    { label: "In progress / done", items: s.proposals.filter((p) => !["suggested", "approved", "rejected"].includes(p.status)) },
    { label: "Rejected", items: s.proposals.filter((p) => p.status === "rejected") },
  ];
  const fbByProposal = new Map<string, Feedback[]>();
  for (const f of s.feedback) if (f.proposal_id) fbByProposal.set(f.proposal_id, [...(fbByProposal.get(f.proposal_id) ?? []), f]);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Proposals</h2>
        <div className="flex gap-2">
          {selected.length >= 2 && (
            <Button size="sm" variant="secondary" onClick={async () => { await act({ type: "merge", targetId: selected[0], sourceIds: selected.slice(1) }); setSelected([]); }}>
              <GitMerge className="h-3.5 w-3.5" /> Merge {selected.length} into first selected
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>+ New</Button>
          {!s.proposals.some((p) => p.source === "seed") && <Button size="sm" variant="ghost" onClick={() => act({ type: "load_seed" })}>Load demo seed</Button>}
        </div>
      </div>
      {creating && <ProposalEditor onCancel={() => setCreating(false)} onSave={async (data) => { await act({ type: "proposal_create", data }); setCreating(false); }} />}
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-fg-subtle">{g.label}</p>
          <ul className="space-y-2">
            {g.items.map((p) => (
              <li key={p.id} className={cn("rounded-xl border p-3", p.needs_review && p.status === "suggested" ? "border-warn/50" : "border-line")} data-testid="admin-proposal" data-title={p.title}>
                {editing === p.id ? (
                  <ProposalEditor initial={p} onCancel={() => setEditing(null)} onSave={async (data) => { await act({ type: "proposal_edit", proposalId: p.id, data }); setEditing(null); }} />
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={`Select ${p.title}`}
                        checked={selected.includes(p.id)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
                        disabled={!["suggested", "approved", "rejected"].includes(p.status)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{p.title}</p>
                        <p className="text-sm text-fg-muted">{p.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge>{p.complexity}</Badge>
                          <Badge>{p.supporters} supporter{p.supporters === 1 ? "" : "s"}</Badge>
                          <Badge>{p.status}</Badge>
                          {p.needs_review && <Badge tone="warn">uncertain grouping</Badge>}
                        </div>
                        {p.missing_details_json.length > 0 && <p className="mt-1 text-xs text-warn">Missing: {p.missing_details_json.join("; ")}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {p.status !== "approved" && ["suggested", "rejected"].includes(p.status) && (
                          <Button size="sm" onClick={() => act({ type: "proposal_status", proposalId: p.id, status: "approved" })} disabled={busy !== null} data-testid="approve-proposal">Approve</Button>
                        )}
                        {p.status === "approved" && <Button size="sm" variant="ghost" onClick={() => act({ type: "proposal_status", proposalId: p.id, status: "suggested" })}>Unapprove</Button>}
                        {p.status === "suggested" && <Button size="sm" variant="ghost" onClick={() => act({ type: "proposal_status", proposalId: p.id, status: "rejected" })}>Reject</Button>}
                        {["suggested", "approved", "selected"].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)}>Edit</Button>}
                      </div>
                    </div>
                    {(fbByProposal.get(p.id)?.length ?? 0) > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-fg-subtle">Source feedback ({fbByProposal.get(p.id)!.length})</summary>
                        <ul className="mt-1 space-y-1">
                          {fbByProposal.get(p.id)!.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg-sunken px-2 py-1.5 text-xs">
                              <span><span className="text-fg-subtle">{f.nickname}:</span> {f.text || "(no text)"} {f.confidence != null && f.confidence < 1 && <span className="text-warn">({Math.round(f.confidence * 100)}%)</span>}</span>
                              <span className="flex shrink-0 gap-1">
                                <select
                                  aria-label="Move to proposal"
                                  className="h-7 max-w-32 rounded border border-line bg-bg-raised text-xs"
                                  value=""
                                  onChange={(e) => e.target.value && act({ type: "move_feedback", feedbackId: f.id, proposalId: e.target.value })}
                                >
                                  <option value="">Move…</option>
                                  {s.proposals.filter((x) => x.id !== p.id && ["suggested", "approved"].includes(x.status)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                                </select>
                                <button className="rounded px-1.5 text-fg-subtle hover:text-fg" title="Split into its own proposal" onClick={() => act({ type: "split_feedback", feedbackId: f.id })} data-testid="split-feedback">
                                  <Scissors className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function ProposalEditor({ initial, onSave, onCancel }: { initial?: Proposal; onSave: (d: Record<string, unknown>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [req, setReq] = useState((initial?.requirements_json ?? []).join("\n"));
  const [acc, setAcc] = useState((initial?.acceptance_criteria_json ?? []).join("\n"));
  const [complexity, setComplexity] = useState<Complexity>(initial?.complexity ?? "small");
  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      <Input className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <Textarea rows={3} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Requirements (one per line)" className="font-mono text-sm" />
      <Textarea rows={3} value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="Acceptance criteria (one per line)" className="font-mono text-sm" />
      <div className="flex gap-2">
        <select className="h-9 rounded-lg border border-line bg-bg-sunken px-2 text-sm" value={complexity} onChange={(e) => setComplexity(e.target.value as Complexity)}>
          {["small", "medium", "large", "unknown"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <Button size="sm" onClick={() => onSave({ title, description, requirements: lines(req), acceptanceCriteria: lines(acc), complexity })} disabled={!title.trim()}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- feedback moderation

function FeedbackPanel({ s, act }: { s: AdminState; act: Act }) {
  const [filter, setFilter] = useState<"all" | "held" | "untriaged">("all");
  const items = s.feedback.filter((f) => (filter === "held" ? f.moderation === "held" : filter === "untriaged" ? !f.proposal_id && f.type !== "praise" : true));
  const held = s.feedback.filter((f) => f.moderation === "held").length;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Feedback ({s.feedback.length})</h2>
        <div className="flex gap-1 text-xs">
          {(["all", "held", "untriaged"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-2.5 py-1", filter === f ? "bg-accent-soft text-accent" : "text-fg-subtle")}>
              {f}{f === "held" && held ? ` (${held})` : ""}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-96 space-y-1.5 overflow-auto">
        {items.map((f) => (
          <li key={f.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", f.moderation === "held" ? "border-warn/50" : f.moderation === "hidden" ? "border-line opacity-50" : "border-line")}>
            <Badge className="mt-0.5">{f.type}</Badge>
            <div className="min-w-0 flex-1">
              <p className="break-words">{f.text || <span className="text-fg-subtle">(no text)</span>}</p>
              <p className="text-xs text-fg-subtle">
                {f.nickname}
                {f.element_label && <> · on &ldquo;{f.element_label}&rdquo;</>}
                {f.page_url && <> · {f.page_url}</>}
                {f.moderation === "held" && <span className="text-warn"> · held by filter</span>}
              </p>
            </div>
            {f.region && <RegionMap region={f.region} />}
            {f.moderation === "hidden" ? (
              <button title="Show" onClick={() => act({ type: "feedback_moderation", feedbackId: f.id, moderation: "visible" })}><Eye className="h-4 w-4 text-fg-subtle" /></button>
            ) : (
              <>
                {f.moderation === "held" && <button title="Approve for public display" onClick={() => act({ type: "feedback_moderation", feedbackId: f.id, moderation: "visible" })}><Check className="h-4 w-4 text-accent" /></button>}
                <button title="Hide from public" onClick={() => act({ type: "feedback_moderation", feedbackId: f.id, moderation: "hidden" })} data-testid="hide-feedback"><EyeOff className="h-4 w-4 text-fg-subtle" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- settings + queues

function SettingsPanel({ s, act }: { s: AdminState; act: Act }) {
  const [acu, setAcu] = useState(s.room.maxAcuPerSession);
  const [sessions, setSessions] = useState(s.room.maxSessionsTotal);
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Agent budget</h2>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">Max ACUs / session<Input type="number" className="h-10" min={1} max={100} value={acu} onChange={(e) => setAcu(Number(e.target.value))} /></label>
        <label className="space-y-1">Max real sessions (room)<Input type="number" className="h-10" min={0} max={50} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => act({ type: "settings", maxAcuPerSession: acu, maxSessionsTotal: sessions })}>Save budget</Button>
        <Button size="sm" variant={s.room.agentPaused ? "primary" : "danger"} onClick={() => act({ type: "settings", agentPaused: !s.room.agentPaused })}>
          {s.room.agentPaused ? <><Play className="h-3.5 w-3.5" /> Resume agent launches</> : <><Pause className="h-3.5 w-3.5" /> Pause agent launches</>}
        </Button>
      </div>
    </Card>
  );
}

function QueuesPanel({ s, act }: { s: AdminState; act: Act }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Worker queues</h2>
      <ul className="space-y-1 text-sm">
        {s.queues.map((q) => (
          <li key={q.queue} className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{q.queue}</span>
            <span className="flex items-center gap-2 text-xs text-fg-subtle tabular">
              {q.queued} queued · {q.running} running · <span className={q.dead ? "text-danger" : ""}>{q.dead} dead</span>
              <button onClick={() => act({ type: "queue_paused", queue: q.queue, paused: !q.paused })} title={q.paused ? "Resume" : "Pause"}>
                {q.paused ? <Play className="h-3.5 w-3.5 text-warn" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {s.deadJobs.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-danger">Failed jobs ({s.deadJobs.length})</summary>
          <ul className="mt-2 space-y-1">
            {s.deadJobs.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-2 rounded bg-bg-sunken p-2 text-xs">
                <span className="min-w-0"><span className="font-mono">{j.queue}</span> · {j.attempts} attempts<br /><span className="break-words text-danger">{j.lastError}</span></span>
                <span className="flex shrink-0 gap-1">
                  <button title="Retry" onClick={() => act({ type: "retry_dead_job", jobId: j.id })}><RefreshCw className="h-3.5 w-3.5" /></button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-fg-subtle"><Trash2 className="mr-1 inline h-3 w-3" />Dead jobs are kept for inspection; retry re-queues with a fresh attempt budget.</p>
    </Card>
  );
}

/** Where on the page a participant circled: the page outline with their drawing on it. */
function RegionMap({ region }: { region: NonNullable<Feedback["region"]> }) {
  // Show one screen-height-ish window around the circle so tall pages stay readable.
  const viewH = Math.min(region.pageH, Math.max(region.h * 3, region.pageW * 1.6));
  const top = Math.max(0, Math.min(region.pageH - viewH, region.y + region.h / 2 - viewH / 2));
  const d = `M${region.points.map(([x, y]) => `${x},${y}`).join(" L")} Z`;
  return (
    <svg
      viewBox={`0 ${top} ${region.pageW} ${viewH}`}
      className="h-16 w-12 shrink-0 rounded-md border border-line bg-bg-sunken"
      role="img"
      aria-label={`Circled area at ${region.x},${region.y} (${region.w}×${region.h}px) on a ${region.pageW}px-wide page`}
      data-testid="feedback-region"
    >
      <title>{`Circled ${region.w}×${region.h}px at (${region.x}, ${region.y})`}</title>
      <path d={d} fill="oklch(0.72 0.16 290 / 0.25)" stroke="oklch(0.78 0.15 290)" strokeWidth={Math.max(2, region.pageW / 90)} strokeLinejoin="round" />
    </svg>
  );
}
