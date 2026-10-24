import { castVote, rateLimit, recordMetric } from "@crowdship/db";
import { voteInput } from "@crowdship/shared";
import { assertSameOrigin, parseJson, route } from "@/lib/api";
import { requireParticipant } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const POST = route<RoomCtx>(async (req, ctx) => {
  const started = performance.now();
  assertSameOrigin(req);
  const code = await roomCode(ctx);
  const { room, participant } = await requireParticipant(code);
  await rateLimit(`vote:${participant.id}`, 20, 60);
  const input = await parseJson(req, voteInput);
  const res = await castVote(room, participant.id, input.roundId, input.proposalId);
  void recordMetric("vote_latency", { ms: performance.now() - started }, { changed: res.changed }, room.id);
  return { ok: true, proposalId: input.proposalId, tallies: Object.fromEntries(res.tallies.map((t) => [t.proposal_id, t.votes])) };
});
