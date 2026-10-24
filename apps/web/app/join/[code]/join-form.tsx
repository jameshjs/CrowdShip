"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";

const ADJ = ["Swift", "Brave", "Clever", "Sunny", "Cosmic", "Quiet", "Lucky", "Bold", "Witty", "Nimble"];
const ANI = ["Otter", "Falcon", "Panda", "Lynx", "Koala", "Heron", "Fox", "Gecko", "Orca", "Badger"];

export function JoinForm({ code, suggested, closed }: { code: string; suggested: string; closed: boolean }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/rooms/${code}/join`, { nickname: nickname.trim() || undefined });
      const ms = performance.now();
      void api("/api/metrics", { room: code, name: "time_to_join_client", ms }).catch(() => {});
      router.replace(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  }

  if (closed) return <p className="rounded-xl bg-bg-raised p-4 text-center text-fg-muted">This session has ended.</p>;

  return (
    <form onSubmit={join} className="space-y-3">
      <label htmlFor="nickname" className="text-sm text-fg-muted">Your nickname</label>
      <div className="flex gap-2">
        <Input
          id="nickname"
          data-testid="nickname-input"
          value={nickname}
          maxLength={32}
          autoComplete="off"
          onChange={(e) => setNickname(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-12 w-12 shrink-0"
          aria-label="Random nickname"
          onClick={() => setNickname(`${ADJ[Math.floor(Math.random() * ADJ.length)]} ${ANI[Math.floor(Math.random() * ANI.length)]}`)}
        >
          <Shuffle className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="join-button">
        {busy ? "Joining…" : "Join"} <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="text-center text-xs text-fg-subtle">No account needed.</p>
    </form>
  );
}
