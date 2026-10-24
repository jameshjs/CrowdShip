import { audit, createRoom, listRoomsForOrganizer } from "@crowdship/db";
import { createRoomInput } from "@crowdship/shared";
import { assertSameOrigin, parseJson, route } from "@/lib/api";
import { requireOrganizer } from "@/lib/auth";

export const GET = route(async () => {
  const organizerId = await requireOrganizer();
  return { rooms: await listRoomsForOrganizer(organizerId) };
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const organizerId = await requireOrganizer();
  const input = await parseJson(req, createRoomInput);
  const room = await createRoom({ ...input, organizerId });
  await audit(room.id, organizerId, "room_created", { provider: input.agentProvider, repo: input.githubRepository });
  return { code: room.code };
});
