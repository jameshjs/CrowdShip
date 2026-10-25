import { loadRoom } from "@/lib/server-room";
import { joinQrSvg, joinUrl } from "@/lib/qr";
import { IdeaTree } from "./idea-tree";

export const dynamic = "force-dynamic";

export default async function TreePage({ params }: { params: Promise<{ code: string }> }) {
  const room = await loadRoom((await params).code);
  return <IdeaTree code={room.code} qrSvg={await joinQrSvg(room.code)} joinUrl={joinUrl(room.code)} />;
}
