import { generateNickname, getRoomByCode, joinRoom, rateLimit, recordMetric, AppError } from "@crowdship/db";
import { joinInput, moderate } from "@crowdship/shared";
import { assertSameOrigin, clientIp, parseJson, route } from "@/lib/api";
import { ensureGuestSession } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const POST = route<RoomCtx>(async (req, ctx) => {
  const started = performance.now();
  assertSameOrigin(req);
  const code = await roomCode(ctx);
  await rateLimit(`join:${clientIp(req)}`, 400, 60) // venue Wi-Fi: many phones share one IP;
  const input = await parseJson(req, joinInput);
  const room = await getRoomByCode(code);
  if (room.status !== "active") throw new AppError(410, "room_closed", "This session has ended");
  let nickname = input.nickname ?? generateNickname();
  if (!moderate(nickname).ok) nickname = generateNickname();
  const gsid = await ensureGuestSession();
  const { participant, isNew } = await joinRoom(room, gsid, nickname);
  const ms = performance.now() - started;
  void recordMetric("join_latency", { ms }, { isNew }, room.id);
  return { participantId: participant.id, nickname: participant.nickname, isNew };
});
