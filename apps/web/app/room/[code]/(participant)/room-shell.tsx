"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Home, MessageSquarePlus, Vote } from "lucide-react";
import { useRoom } from "@/lib/client/use-room";
import { SailMark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShipMoment } from "./ship-moment";

type RoomCtx = ReturnType<typeof useRoom> & { code: string };
const Ctx = createContext<RoomCtx | null>(null);

export function useRoomCtx(): RoomCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoomCtx outside RoomShell");
  return v;
}

export function RoomShell({ code, children }: { code: string; children: React.ReactNode }) {
  const room = useRoom(code, { trackPresence: true });
  const pathname = usePathname();
  const base = `/room/${code}`;
  const tabs = [
    { href: base, id: "home", label: "Home", icon: Home },
    { href: `${base}/feedback`, id: "feedback", label: "Feedback", icon: MessageSquarePlus },
    { href: `${base}/vote`, id: "vote", label: "Vote", icon: Vote, dot: room.state?.round?.status === "voting" },
  ];
  const reconnecting = room.status !== "live" && room.status !== "connecting";
  return (
    <Ctx.Provider value={{ ...room, code }}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="sticky top-0 z-20 glass border-b border-line/60 px-5 py-3">
          <div className="flex items-center gap-3">
            <SailMark className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{room.state?.room.projectName ?? "…"}</p>
              <p className="text-xs text-fg-subtle">
                <span className="font-mono">{code}</span>
                {" · "}
                <span data-testid="online-count" className="tabular">{room.online ?? room.state?.stats.participants ?? 0}</span> here
                {reconnecting && <span className="ml-1 text-warn">· reconnecting</span>}
              </p>
            </div>
            {room.state?.room.demoMode && (
              <Badge tone="demo" title="Agent execution in this room is simulated by the mock provider">
                <FlaskConical className="h-3 w-3" aria-hidden /> Demo
              </Badge>
            )}
          </div>
        </header>
        <main className="flex-1 px-5 pb-28 pt-5">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 glass border-t border-line/60 safe-bottom" aria-label="Room">
          <ul className="mx-auto grid max-w-md grid-cols-3">
            {tabs.map((t) => {
              const active = t.href === base ? pathname === base || pathname === `${base}/activity` : pathname.startsWith(t.href);
              const Icon = t.icon;
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")}
                    aria-current={active ? "page" : undefined}
                    data-testid={`tab-${t.id}`}
                  >
                    <span className={cn("grid h-8 w-12 place-items-center rounded-full transition-colors", active && "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_oklch(0.72_0.16_290/0.35)]")}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    {t.label}
                    {t.dot && <span className="absolute right-[30%] top-2.5 h-2 w-2 rounded-full bg-accent animate-pulse-ring" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <ShipMoment />
      </div>
    </Ctx.Provider>
  );
}
