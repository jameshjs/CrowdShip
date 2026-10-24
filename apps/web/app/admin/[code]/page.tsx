import { redirect } from "next/navigation";
import { currentOrganizer } from "@/lib/auth";
import { loadRoom } from "@/lib/server-room";
import { joinQrSvg, joinUrl } from "@/lib/qr";
import { OrganizerDashboard } from "./organizer-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const organizer = await currentOrganizer();
  if (!organizer) redirect("/admin");
  const room = await loadRoom((await params).code);
  if (room.organizer_id !== organizer) redirect("/admin");
  return <OrganizerDashboard code={room.code} qrSvg={await joinQrSvg(room.code)} joinUrl={joinUrl(room.code)} />;
}
