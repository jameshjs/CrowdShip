import { redirect } from "next/navigation";
import { generateNickname } from "@crowdship/db";
import { loadParticipant, loadRoom } from "@/lib/server-room";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const room = await loadRoom((await params).code);
  if (await loadParticipant(room)) redirect(`/room/${room.code}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-5 pb-8 pt-12">
      <div>
        <div className="mb-10 flex items-center gap-2 text-sm font-semibold tracking-tight text-fg-muted">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-fg">C</span> CrowdShip
        </div>
        <p className="text-sm text-fg-muted">You&apos;re joining</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{room.project_name}</h1>
        {room.project_description && <p className="mt-3 text-fg-muted">{room.project_description}</p>}
        <ul className="mt-8 space-y-3 text-sm text-fg-muted">
          <li>💡 Suggest features or report bugs</li>
          <li>🗳️ Vote on what gets built next</li>
          <li>🤖 Watch an AI agent build it, live</li>
        </ul>
      </div>
      <JoinForm code={room.code} suggested={generateNickname()} closed={room.status !== "active"} />
    </main>
  );
}
