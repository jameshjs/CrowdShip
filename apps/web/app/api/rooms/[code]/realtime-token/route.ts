import { getParticipant, getRoomByCode, rateLimit } from "@crowdship/db";
import { clientIp, route } from "@/lib/api";
import { mintRealtimeToken, readGuestSessionId } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const dynamic = "force-dynamic";

export const GET = route<RoomCtx>(async (req, ctx) => {
  const code = await roomCode(ctx);
  await rateLimit(`rt:${clientIp(req)}`, 1000, 60);
  const room = await getRoomByCode(code);
  const gsid = await readGuestSessionId();
  const participant = gsid ? await getParticipant(room.id, gsid) : null;
  const token = await mintRealtimeToken(room.code, participant?.id ?? null);
  return Response.json({ token, participantId: participant?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
});
