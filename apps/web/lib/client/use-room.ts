"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { BROADCAST_EVENTS, type PublicActivity, type PublicRoomState } from "@crowdship/shared";
import { api } from "./api";

export type RoomStateWithMe = PublicRoomState & {
  me: { participantId: string; nickname: string; vote: string | null; previewRating: string | null } | null;
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabase ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return supabase;
}

/**
 * Canonical room state + live updates.
 * The database is the source of truth: every broadcast is treated as a hint
 * to refetch, and every (re)subscribe refetches, so missed events never matter.
 * Vote tallies are applied immediately from the broadcast for snappy counters.
 */
export function useRoom(code: string, opts: { trackPresence?: boolean } = {}) {
  const [state, setState] = useState<RoomStateWithMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [flash, setFlash] = useState<PublicActivity | null>(null);
  const clockOffset = useRef(0);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const pending = useRef(false);
  const latencySamples = useRef(0);

  const refetch = useCallback(async () => {
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    try {
      const t0 = Date.now();
      const s = await api<RoomStateWithMe>(`/api/rooms/${code}/state`);
      const t1 = Date.now();
      clockOffset.current = new Date(s.serverTime).getTime() - (t0 + t1) / 2;
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load room");
    } finally {
      inflight.current = false;
      if (pending.current) {
        pending.current = false;
        void refetch();
      }
    }
  }, [code]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void refetch(), 120);
  }, [refetch]);

  useEffect(() => {
    void refetch();
    const poll = setInterval(() => void refetch(), 30_000);
    const onVisible = () => document.visibilityState === "visible" && void refetch();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setStatus("offline");
      return;
    }
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let tokenTimer: ReturnType<typeof setInterval> | null = null;

    const sampleLatency = (sentAt: unknown) => {
      if (typeof sentAt !== "number" || latencySamples.current >= 5 || Math.random() > 0.3) return;
      latencySamples.current++;
      const ms = Date.now() + clockOffset.current - sentAt;
      if (ms >= 0 && ms < 60_000) {
        void api("/api/metrics", { room: code, name: "realtime_delivery", ms }).catch(() => {});
      }
    };

    (async () => {
      const { token, participantId } = await api<{ token: string; participantId: string | null }>(`/api/rooms/${code}/realtime-token`);
      if (cancelled) return;
      await sb.realtime.setAuth(token);
      tokenTimer = setInterval(async () => {
        try {
          const fresh = await api<{ token: string }>(`/api/rooms/${code}/realtime-token`);
          await sb.realtime.setAuth(fresh.token);
        } catch {}
      }, 60 * 60_000);

      const presenceKey = participantId ?? `viewer-${crypto.randomUUID()}`;
      channel = sb.channel(`room:${code}`, { config: { private: true, presence: { key: presenceKey } } });
      channel
        .on("broadcast", { event: BROADCAST_EVENTS.votes }, ({ payload }) => {
          sampleLatency(payload.sentAt);
          const tallies = payload.tallies as Record<string, number>;
          setState((s) =>
            s && s.round?.id === payload.roundId
              ? { ...s, proposals: s.proposals.map((p) => (p.id in tallies ? { ...p, votes: tallies[p.id]! } : p)) }
              : s,
          );
        })
        .on("broadcast", { event: BROADCAST_EVENTS.activity }, ({ payload }) => {
          sampleLatency(payload.sentAt);
          setFlash(payload as PublicActivity);
          scheduleRefetch();
        })
        .on("broadcast", { event: BROADCAST_EVENTS.stateChanged }, ({ payload }) => {
          sampleLatency(payload.sentAt);
          scheduleRefetch();
        })
        .on("presence", { event: "sync" }, () => {
          const ps = channel!.presenceState<{ p?: boolean }>();
          setOnline(Object.values(ps).filter((metas) => metas.some((m) => m.p)).length);
        })
        .subscribe(async (s) => {
          if (s === "SUBSCRIBED") {
            setStatus("live");
            void refetch();
            if (opts.trackPresence && participantId) await channel!.track({ p: true });
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            setStatus("reconnecting");
          } else if (s === "CLOSED") {
            setStatus("offline");
          }
        });
    })().catch(() => setStatus("offline"));

    return () => {
      cancelled = true;
      if (tokenTimer) clearInterval(tokenTimer);
      if (channel) void sb.removeChannel(channel);
    };
  }, [code, opts.trackPresence, refetch, scheduleRefetch]);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  return { state, setState, error, online, status, refetch, flash, serverNow };
}
