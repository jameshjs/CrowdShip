import { redirect } from "next/navigation";
import { generateNickname } from "@crowdship/db";
import { loadParticipant, loadRoom } from "@/lib/server-room";
import { Bot, Lightbulb, Vote } from "lucide-react";
import { Logo } from "@/components/brand";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Lightbulb, label: "Suggest features or report bugs", tone: "from-[#7a7cf0] to-[#5b8df5]" },
  { icon: Vote, label: "Vote on what gets built next", tone: "from-[#8b6cf0] to-[#5f62e0]" },
  { icon: Bot, label: "Watch an AI agent build it, live", tone: "from-[#d17ee8] to-[#8e6cf0]" },
];

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const room = await loadRoom((await params).code);
  if (await loadParticipant(room)) redirect(`/room/${room.code}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-5 pb-8 pt-12">
      <div>
        <Logo className="mb-10 text-base" markClassName="h-8 w-8" />
        <p className="text-sm text-fg-muted">You&apos;re joining</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-balance">{room.project_name}</h1>
        {room.project_description && <p className="mt-3 text-fg-muted">{room.project_description}</p>}
        <ul className="mt-8 space-y-2.5">
          {STEPS.map((s) => (
            <li key={s.label} className="glass flex items-center gap-3 rounded-2xl border border-line p-3 text-sm">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}>
                <s.icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8">
        <JoinForm code={room.code} suggested={generateNickname()} closed={room.status !== "active"} />
      </div>
    </main>
  );
}
