import type {
  AgentProviderName, AgentState, CheckStatus, Complexity, FeedbackType, ProposalStatus, RoundStatus,
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
    repository: string;
    productionUrl: string | null;
    provider: AgentProviderName;
    demoMode: boolean;
  };
  stats: { participants: number; feedback: number; proposals: number };
  round: PublicRound | null;
  proposals: PublicProposal[];
  agent: PublicAgentSession | null;
  activity: PublicActivity[];
  reviews: { yes: number; no: number; needs_improvement: number };
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
