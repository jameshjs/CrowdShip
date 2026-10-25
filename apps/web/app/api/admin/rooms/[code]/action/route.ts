import { z } from "zod";
import {
  approveForDevelopment, attachFeedbackToProposal, audit, cancelAgentSession, cancelRound, chooseWinner, closeVoting,
  completeRound, publishResults, createOrganizerProposal, editProposal, enqueue, failRound, getAgentSession, insertSeedProposals,
  mergeProposals, moveFeedback, releasePreview, reopenVoting, retryDeadJob,
  setFeedbackModeration, setProposalStatus, setQueuePaused, setTriaging, splitFeedback, startVoting, stateChanged,
  updateAgentSession, updateRoomSettings, db, badRequest,
} from "@crowdship/db";
import { isAllowedPreviewUrl, proposalEditInput, QUEUES } from "@crowdship/shared";
import { assertSameOrigin, parseJson, route } from "@/lib/api";
import { requireRoomOrganizer } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

const uuid = z.uuid();
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("proposal_status"), proposalId: uuid, status: z.enum(["approved", "rejected", "suggested"]) }),
  z.object({ type: z.literal("proposal_edit"), proposalId: uuid, data: proposalEditInput }),
  z.object({ type: z.literal("proposal_create"), data: proposalEditInput }),
  z.object({ type: z.literal("merge"), targetId: uuid, sourceIds: z.array(uuid).min(1).max(20) }),
  z.object({ type: z.literal("split_feedback"), feedbackId: uuid }),
  z.object({ type: z.literal("move_feedback"), feedbackId: uuid, proposalId: uuid }),
  z.object({ type: z.literal("attach_feedback"), feedbackIds: z.array(uuid).min(1), proposalId: uuid }),
  z.object({ type: z.literal("feedback_moderation"), feedbackId: uuid, moderation: z.enum(["visible", "hidden"]) }),
  z.object({ type: z.literal("run_triage") }),
  z.object({ type: z.literal("load_seed") }),
  z.object({ type: z.literal("start_voting"), proposalIds: z.array(uuid).min(1).max(12), durationSeconds: z.number().int().min(15).max(3600) }),
  z.object({ type: z.literal("close_voting") }),
  z.object({ type: z.literal("reopen_voting"), durationSeconds: z.number().int().min(15).max(3600) }),
  z.object({ type: z.literal("choose_winner"), proposalId: uuid }),
  z.object({ type: z.literal("cancel_round") }),
  z.object({ type: z.literal("fail_round") }),
  z.object({ type: z.literal("approve_development") }),
  z.object({ type: z.literal("cancel_agent"), agentSessionId: uuid }),
  z.object({ type: z.literal("reconcile_agent"), agentSessionId: uuid }),
  z.object({ type: z.literal("recheck_verification"), agentSessionId: uuid }),
  z.object({ type: z.literal("set_preview_url"), agentSessionId: uuid, previewUrl: z.url().refine(isAllowedPreviewUrl, "Must start with https:// (or http://localhost for local testing)") }),
  z.object({ type: z.literal("release_preview"), agentSessionId: uuid }),
  z.object({ type: z.literal("complete_round") }),
  z.object({ type: z.literal("publish_results") }),
  z.object({
    type: z.literal("settings"),
    maxAcuPerSession: z.number().int().min(1).max(100).optional(),
    maxSessionsTotal: z.number().int().min(0).max(50).optional(),
    agentPaused: z.boolean().optional(),
  }),
  z.object({ type: z.literal("queue_paused"), queue: z.enum(QUEUES), paused: z.boolean() }),
  z.object({ type: z.literal("retry_dead_job"), jobId: uuid }),
]);

export const POST = route<RoomCtx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { organizerId, room } = await requireRoomOrganizer(await roomCode(ctx));
  const a = await parseJson(req, action);
  const result = await perform(room, a);
  await audit(room.id, organizerId, a.type, a as Record<string, unknown>);
  return { ok: true, ...(result ?? {}) };
});

async function sessionInRoom(roomId: string, id: string) {
  const s = await getAgentSession(id);
  if (s.room_id !== roomId) throw badRequest("Session is not in this room");
  return s;
}

async function perform(room: Awaited<ReturnType<typeof requireRoomOrganizer>>["room"], a: z.infer<typeof action>): Promise<Record<string, unknown> | void> {
  switch (a.type) {
    case "proposal_status":
      return setProposalStatus(room, a.proposalId, a.status);
    case "proposal_edit":
      return editProposal(room, a.proposalId, a.data);
    case "proposal_create":
      return { proposalId: await createOrganizerProposal(room, a.data) };
    case "merge":
      return mergeProposals(room, a.targetId, a.sourceIds);
    case "split_feedback":
      return { proposalId: await splitFeedback(room, a.feedbackId) };
    case "move_feedback":
      return moveFeedback(room, a.feedbackId, a.proposalId);
    case "attach_feedback":
      return attachFeedbackToProposal(room, a.proposalId, a.feedbackIds, 1);
    case "feedback_moderation":
      return setFeedbackModeration(room, a.feedbackId, a.moderation);
    case "run_triage":
      await setTriaging(room, true);
      await enqueue("feedback-triage", { roomId: room.id, manual: true }, { idempotencyKey: `triage-manual:${room.id}:${Math.floor(Date.now() / 5000)}` });
      return;
    case "load_seed":
      await db().begin(async (sql) => {
        await insertSeedProposals(sql, room.id);
        await stateChanged(sql, room.code, "proposal");
      });
      return;
    case "start_voting":
      await startVoting(room, a.proposalIds, a.durationSeconds);
      return;
    case "close_voting":
      return { result: await closeVoting(room) };
    case "reopen_voting":
      return reopenVoting(room, a.durationSeconds);
    case "choose_winner":
      return chooseWinner(room, a.proposalId);
    case "cancel_round":
      return cancelRound(room);
    case "fail_round":
      return failRound(room);
    case "approve_development": {
      const { session, created } = await approveForDevelopment(room, "organizer");
      return { agentSessionId: session.id, created };
    }
    case "cancel_agent":
      await sessionInRoom(room.id, a.agentSessionId);
      return cancelAgentSession(room, a.agentSessionId);
    case "reconcile_agent":
      await sessionInRoom(room.id, a.agentSessionId);
      await enqueue("session-monitor", { agentSessionId: a.agentSessionId }, { idempotencyKey: `monitor-manual:${a.agentSessionId}:${Math.floor(Date.now() / 5000)}` });
      return;
    case "recheck_verification": {
      const s = await sessionInRoom(room.id, a.agentSessionId);
      if (!s.pr_head_sha) throw badRequest("No PR yet");
      await enqueue("verification", { agentSessionId: s.id, sha: s.pr_head_sha }, { idempotencyKey: `verify-manual:${s.id}:${Math.floor(Date.now() / 5000)}`, maxAttempts: 200 });
      return;
    }
    case "set_preview_url":
      await sessionInRoom(room.id, a.agentSessionId);
      await updateAgentSession(a.agentSessionId, { preview_url: a.previewUrl });
      await stateChanged(db(), room.code, "agent");
      return;
    case "release_preview":
      await sessionInRoom(room.id, a.agentSessionId);
      return releasePreview(room, a.agentSessionId, null);
    case "complete_round":
      return completeRound(room);
    case "publish_results":
      return publishResults(room);
    case "settings":
      await updateRoomSettings(room.id, a);
      await stateChanged(db(), room.code, "settings");
      return;
    case "queue_paused":
      return setQueuePaused(a.queue, a.paused);
    case "retry_dead_job":
      return retryDeadJob(a.jobId);
  }
}

