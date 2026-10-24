import { rateLimit, recordMetric, submitFeedback } from "@crowdship/db";
import { feedbackInput } from "@crowdship/shared";
import { assertSameOrigin, parseJson, route } from "@/lib/api";
import { requireParticipant } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";
import { corsHeaders, preflight } from "@/lib/cors";

export const OPTIONS = preflight;

export const POST = route<RoomCtx>(async (req, ctx) => {
  const started = performance.now();
  assertSameOrigin(req);
  const code = await roomCode(ctx);
  const { room, participant } = await requireParticipant(code, req);
  await rateLimit(`fb:${participant.id}`, 10, 60);
  const input = await parseJson(req, feedbackInput);
  const fb = await submitFeedback(room, participant, input);
  void recordMetric("feedback_latency", { ms: performance.now() - started }, { type: fb.type }, room.id);
  return Response.json({ id: fb.id, held: fb.moderation !== "visible" }, { headers: corsHeaders(req) });
});
