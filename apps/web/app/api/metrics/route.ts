import { z } from "zod";
import { getRoomByCode, rateLimit, recordMetric } from "@crowdship/db";
import { roomCodeSchema } from "@crowdship/shared";
import { assertSameOrigin, clientIp, parseJson, route } from "@/lib/api";

const input = z.object({
  room: roomCodeSchema,
  name: z.enum(["realtime_delivery", "time_to_join_client"]),
  ms: z.number().min(0).max(120_000),
});

/** Client-observed timings (sampled). Clock offset is corrected client-side using serverTime from /state. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  await rateLimit(`metric:${clientIp(req)}`, 500, 60);
  const m = await parseJson(req, input);
  const room = await getRoomByCode(m.room);
  await recordMetric(m.name, { ms: m.ms }, { source: "client" }, room.id);
  return { ok: true };
});
