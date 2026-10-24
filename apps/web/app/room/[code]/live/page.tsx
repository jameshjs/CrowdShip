import { loadRoom } from "@/lib/server-room";
import { joinQrSvg, joinUrl } from "@/lib/qr";
import { LiveDashboard } from "./live-dashboard";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ code: string }> }) {
  const room = await loadRoom((await params).code);
  return <LiveDashboard code={room.code} qrSvg={await joinQrSvg(room.code)} joinUrl={joinUrl(room.code)} />;
}
