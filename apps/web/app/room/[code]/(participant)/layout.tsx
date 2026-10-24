import { redirect } from "next/navigation";
import { loadParticipant, loadRoom } from "@/lib/server-room";
import { RoomShell } from "./room-shell";

export const dynamic = "force-dynamic";

export default async function ParticipantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const room = await loadRoom((await params).code);
  if (!(await loadParticipant(room))) redirect(`/join/${room.code}`);
  return <RoomShell code={room.code}>{children}</RoomShell>;
}
