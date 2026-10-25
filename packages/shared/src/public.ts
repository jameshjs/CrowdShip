import type { FeedbackRegion } from "./schemas";
import type {
  AgentProviderName, AgentState, RoomMode, CheckStatus, Complexity, FeedbackType, ProposalStatus, RoundStatus,
} from "./domain";

// Shapes sent to browsers. These contain no secrets, no guest session ids,
// no provider credentials, and no raw task prompts.

export interface PublicProposal {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  acceptanceCriteria: string[];
  complexity: Complexity;
  status: ProposalStatus;
  supporters: number;
  votes: number;
  /** Swipe deck results for the current round's ideas phase. */
  approval: { likes: number; dislikes: number };
  /** Where on the page the idea applies, from the feedback behind it (widget element, circle, or "where on the site?"). */
  location: { pageUrl: string | null; label: string | null; region: FeedbackRegion | null } | null;
}

export interface PublicRound {
  id: string;
  number: number;
  status: RoundStatus;
  startedAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  winningProposalId: string | null;
  proposalIds: string[];
}

export interface PublicAgentSession {
  id: string;
  proposalId: string;
  provider: AgentProviderName;
  state: AgentState;
  statusDetail: string | null;
  error: string | null;
  providerUrl: string | null;
  issueUrl: string | null;
  prUrl: string | null;
  prNumber: number | null;
  headSha: string | null;
  previewUrl: string | null;
  previewReleased: boolean;
  launchedAt: string | null;
  prOpenedAt: string | null;
  completedAt: string | null;
  verification: {
    commitSha: string;
    ciStatus: CheckStatus;
    testStatus: CheckStatus;
    checks: { name: string; status: CheckStatus }[];
    verifiedAt: string | null;
    /** True when checks were simulated by the mock provider (no real PR). */
    simulated: boolean;
  } | null;
}

export interface PublicActivity {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PublicRoomState {
  room: {
    code: string;
    status: "active" | "closed";
    projectName: string;
    description: string;
    repository: string | null;
    productionUrl: string | null;
    provider: AgentProviderName;
    /** "feedback": any website, no agent; the round ends with published results. */
    mode: RoomMode;
    demoMode: boolean;
  };
  stats: { participants: number; feedback: number; proposals: number };
  round: PublicRound | null;
  proposals: PublicProposal[];
  agent: PublicAgentSession | null;
  activity: PublicActivity[];
  reviews: { yes: number; no: number; needs_improvement: number };
  /** People whose (visible) feedback became the winning proposal; nicknames are already public in the activity feed. */
  credits: { names: string[]; total: number } | null;
  history: { roundNumber: number; title: string; status: RoundStatus; prUrl: string | null }[];
  serverTime: string;
}

export interface PublicFeedback {
  id: string;
  type: FeedbackType;
  text: string;
  nickname: string;
  elementLabel: string | null;
  createdAt: string;
}

/** Broadcast event names on the room:<CODE> topic. Payloads are hints; clients refetch canonical state. */
export const BROADCAST_EVENTS = {
  stateChanged: "state_changed",
  votes: "votes",
  activity: "activity",
} as const;

/** "Maya", "Maya and Ada", "Maya, Ada and Lee", "Maya, Ada and 4 others" */
export function creditLine(credits: { names: string[]; total: number }, shown = 2): string {
  const { names, total } = credits;
  if (total <= shown + 1) {
    const list = names.slice(0, total);
    return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  }
  const rest = total - shown;
  return `${names.slice(0, shown).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/** Swipe approval with a small prior (one like, one dislike) so 1/1 doesn't outrank 9/10. */
export function approvalScore(a: { likes: number; dislikes: number }): number {
  return (a.likes + 1) / (a.likes + a.dislikes + 2);
}
