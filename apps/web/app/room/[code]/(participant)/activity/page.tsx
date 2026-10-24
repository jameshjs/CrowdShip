"use client";

import { ActivityRow } from "@/components/activity";
import { useNow } from "@/components/status";
import { useRoomCtx } from "../room-shell";

export default function ActivityPage() {
  const { state, serverNow } = useRoomCtx();
  const now = useNow(5000, serverNow);
  if (!state) return <p className="text-fg-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      {state.history.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">Development history</h2>
          <ul className="space-y-2">
            {state.history.map((h) => (
              <li key={h.roundNumber} className="flex items-center justify-between rounded-xl border border-line bg-bg-raised px-4 py-3 text-sm">
                <span>Round {h.roundNumber}: {h.title}</span>
                <span className="text-xs text-fg-subtle">{h.status.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="divide-y divide-line/60" data-testid="activity-feed">
        {state.activity.map((a) => <ActivityRow key={a.id} a={a} now={now} />)}
      </ul>
    </div>
  );
}
