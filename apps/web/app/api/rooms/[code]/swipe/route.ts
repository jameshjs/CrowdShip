import { rateLimit, recordSwipe } from "@crowdship/db";
import { swipeInput } from "@crowdship/shared";
import { assertSameOrigin, parseJson, route } from "@/lib/api";
import { requireParticipant } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const POST = route<RoomCtx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { room, participant } = await requireParticipant(await roomCode(ctx));
  await rateLimit(`swipe:${participant.id}`, 60, 60);
  const input = await parseJson(req, swipeInput);
  const tallies = await recordSwipe(room, participant.id, input.roundId, input.proposalId, input.liked);
  return { ok: true, approval: Object.fromEntries(tallies.map((t) => [t.proposal_id, { likes: t.likes, dislikes: t.dislikes }])) };
});
