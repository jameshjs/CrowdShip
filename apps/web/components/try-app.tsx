"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { api } from "@/lib/client/api";

/**
 * Opens the app under test with a short-lived widget token so in-app feedback is attributed to this participant.
 * `external`: a site we don't own (feedback-only rooms). Open it plainly: never hand our token to a third party.
 */
export function TryAppButton({ code, url, external, children, ...props }: { code: string; url: string; external?: boolean } & ButtonProps) {
  const [busy, setBusy] = useState(false);
  async function open() {
    if (external) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setBusy(true);
    const win = window.open("about:blank", "_blank");
    try {
      const { token } = await api<{ token: string }>(`/api/rooms/${code}/widget-token`, {});
      const u = new URL(url);
      u.searchParams.set("cs_room", code);
      u.searchParams.set("cs_api", window.location.origin);
      u.hash = `cs_token=${encodeURIComponent(token)}`;
      if (win) win.location.href = u.toString();
      else window.location.href = u.toString();
    } catch {
      if (win) win.location.href = url;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button onClick={open} disabled={busy} {...props}>
      {children} <ExternalLink className="h-4 w-4" aria-hidden />
    </Button>
  );
}
