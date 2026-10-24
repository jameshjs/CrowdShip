import "server-only";
import { notFound } from "next/navigation";
import { AppError, getParticipant, getRoomByCode, type RoomRow } from "@crowdship/db";
import { roomCodeSchema } from "@crowdship/shared";
import { readGuestSessionId } from "./auth";

export async function loadRoom(rawCode: string): Promise<RoomRow> {
  const parsed = roomCodeSchema.safeParse(rawCode);
  if (!parsed.success) notFound();
  try {
    return await getRoomByCode(parsed.data);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}

export async function loadParticipant(room: RoomRow) {
  const gsid = await readGuestSessionId();
  return gsid ? getParticipant(room.id, gsid) : null;
}
