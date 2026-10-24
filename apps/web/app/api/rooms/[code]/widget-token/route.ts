import { assertSameOrigin, route } from "@/lib/api";
import { mintWidgetToken, requireParticipant } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const POST = route<RoomCtx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { room, participant } = await requireParticipant(await roomCode(ctx));
  return { token: await mintWidgetToken(room, participant) };
});
