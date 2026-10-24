import { rateLimit, submitPreviewReview } from "@crowdship/db";
import { previewReviewInput, sanitizeText } from "@crowdship/shared";
import { assertSameOrigin, parseJson, route } from "@/lib/api";
import { requireParticipant } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const POST = route<RoomCtx>(async (req, ctx) => {
  assertSameOrigin(req);
  const code = await roomCode(ctx);
  const { room, participant } = await requireParticipant(code);
  await rateLimit(`review:${participant.id}`, 10, 60);
  const input = await parseJson(req, previewReviewInput);
  await submitPreviewReview(room, participant.id, input.proposalId, input.rating, sanitizeText(input.comment, 500));
  return { ok: true };
});
