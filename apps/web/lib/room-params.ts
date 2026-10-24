import { roomCodeSchema } from "@crowdship/shared";

export type RoomCtx = { params: Promise<{ code: string }> };

export async function roomCode(ctx: RoomCtx): Promise<string> {
  return roomCodeSchema.parse((await ctx.params).code);
}
