import type { PublicActivity } from "@crowdship/shared";
import { PROVIDER_LABELS, type AgentProviderName } from "@crowdship/shared";
import {
  Bot, CheckCircle2, GitPullRequest, Lightbulb, MessageSquare, Rocket, ShieldCheck, Sparkles, Star, UserPlus, Vote, XCircle, Merge, Bug, Eye, Flag, Trophy,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" ? v : 0);

/** Turn a public activity event into plain-text copy. Never renders HTML. */
export function describeActivity(a: PublicActivity): { icon: React.ElementType; text: string; tone: "accent" | "info" | "warn" | "danger" | "neutral" | "demo" } {
  const p = a.payload;
  const provider = PROVIDER_LABELS[(s(p.provider) || "mock") as AgentProviderName] ?? "Agent";
  switch (a.type) {
    case "room_created":
      return { icon: Sparkles, text: `Session started for ${s(p.projectName)}`, tone: "info" };
    case "participant_joined":
      return { icon: UserPlus, text: `${s(p.nickname)} joined`, tone: "neutral" };
    case "feedback_submitted": {
      const icon = p.feedbackType === "bug" ? Bug : p.feedbackType === "praise" ? Star : p.feedbackType === "feature" ? Lightbulb : MessageSquare;
      if (p.held) return { icon, text: "New feedback (awaiting moderation)", tone: "neutral" };
      const text = s(p.text);
      const verb = p.feedbackType === "bug" ? "reported" : p.feedbackType === "praise" ? "liked something" : p.feedbackType === "feature" ? "suggested" : "said";
      return { icon, text: text ? `${s(p.nickname)} ${verb}: "${text}"` : `${s(p.nickname)} ${verb}`, tone: p.feedbackType === "bug" ? "warn" : "neutral" };
    }
    case "proposal_created":
      return { icon: Sparkles, text: `AI triage proposed "${s(p.title)}"`, tone: "info" };
    case "feedback_merged":
      return { icon: Merge, text: `${n(p.count)} suggestion${n(p.count) === 1 ? "" : "s"} merged into "${s(p.title)}"`, tone: "info" };
    case "proposals_merged":
      return { icon: Merge, text: `Organizer merged ${n(p.merged)} proposal${n(p.merged) === 1 ? "" : "s"} into "${s(p.title)}"`, tone: "info" };
    case "proposal_approved":
      return { icon: CheckCircle2, text: `"${s(p.title)}" approved for voting`, tone: "accent" };
    case "voting_started":
      return { icon: Vote, text: `Round ${n(p.roundNumber)} voting is open (${n(p.proposals)} proposals)`, tone: "accent" };
    case "voting_reopened":
      return { icon: Vote, text: `Round ${n(p.roundNumber)} voting reopened`, tone: "accent" };
    case "voting_closed":
      return p.winnerId
        ? { icon: Trophy, text: `Voting closed. "${s(p.title)}" won with ${n(p.votes)} votes`, tone: "accent" }
        : { icon: Flag, text: p.tie ? "Voting closed in a tie, so the organizer will pick" : "Voting closed with no votes", tone: "warn" };
    case "winner_chosen":
      return { icon: Trophy, text: `Organizer picked "${s(p.title)}"`, tone: "accent" };
    case "agent_queued":
      return { icon: Bot, text: `Organizer approved "${s(p.title)}" and dispatched it to ${provider}`, tone: p.demoMode ? "demo" : "info" };
    case "agent_launched":
      return { icon: Rocket, text: `${provider} session started`, tone: p.demoMode ? "demo" : "info" };
    case "issue_created":
      return { icon: Flag, text: `GitHub issue #${n(p.issueNumber)} created`, tone: "neutral" };
    case "agent_progress":
      return { icon: Bot, text: `${provider}: ${s(p.detail)}`, tone: p.demoMode ? "demo" : "neutral" };
    case "agent_failed":
      return { icon: XCircle, text: `${provider} session failed: ${s(p.error)}`, tone: "danger" };
    case "agent_cancelled":
      return { icon: XCircle, text: `${provider} session cancelled`, tone: "warn" };
    case "pr_opened":
      return { icon: GitPullRequest, text: `Draft PR #${n(p.prNumber)} opened (${s(p.sha)})`, tone: "info" };
    case "pr_updated":
      return { icon: GitPullRequest, text: `PR #${n(p.prNumber)} updated to ${s(p.sha)}, re-verifying`, tone: "info" };
    case "verification_passed":
      return { icon: ShieldCheck, text: `All required checks passed on ${s(p.sha)}`, tone: "accent" };
    case "verification_failed":
      return { icon: XCircle, text: `Checks failed on ${s(p.sha)}, so it's not verified`, tone: "danger" };
    case "preview_released":
      return { icon: Eye, text: "Preview is ready. Go try version B!", tone: "accent" };
    case "preview_rated":
      return { icon: Star, text: `Someone rated the preview: ${p.rating === "yes" ? "improved" : p.rating === "no" ? "not improved" : "needs work"}`, tone: "neutral" };
    case "round_completed":
      return { icon: CheckCircle2, text: `Round complete: "${s(p.title)}" shipped to review`, tone: "accent" };
    case "round_cancelled":
      return { icon: XCircle, text: `Round ${n(p.roundNumber)} cancelled`, tone: "warn" };
    case "round_failed":
      return { icon: XCircle, text: `Round ${n(p.roundNumber)} marked failed`, tone: "danger" };
    default:
      return { icon: Sparkles, text: a.type.replace(/_/g, " "), tone: "neutral" };
  }
}

const toneClass = {
  accent: "text-accent bg-accent-soft",
  info: "text-info bg-info-soft",
  warn: "text-warn bg-warn-soft",
  danger: "text-danger bg-danger-soft",
  neutral: "text-fg-muted bg-bg-sunken",
  demo: "text-demo bg-demo-soft",
};

export function ActivityRow({ a, now, large }: { a: PublicActivity; now: number; large?: boolean }) {
  const d = describeActivity(a);
  const Icon = d.icon;
  return (
    <li className={cn("flex items-start gap-3", large ? "py-2.5" : "py-2")}>
      <span className={cn("mt-0.5 grid shrink-0 place-items-center rounded-lg", large ? "h-8 w-8" : "h-7 w-7", toneClass[d.tone])}>
        <Icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("break-words text-fg", large ? "text-base leading-snug" : "text-sm")}>{d.text}</p>
        <p className="text-xs text-fg-subtle tabular">{timeAgo(a.createdAt, now)}</p>
      </div>
    </li>
  );
}
