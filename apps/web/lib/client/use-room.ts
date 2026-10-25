"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { BROADCAST_EVENTS, type PublicRoomState } from "@crowdship/shared";
import { api } from "./api";

export type RoomStateWithMe = PublicRoomState & {
  me: { participantId: string; nickname: string; vote: string | null; previewRating: string | null; contributed: boolean; swipes: Record<string, boolean> } | null;
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
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null;
      void refetch();
    }, 120);
  }, [refetch]);

  useEffect(() => {
    void refetch();
    const onVisible = () => document.visibilityState === "visible" && void refetch();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  // Fallback polling: slow when live, fast while disconnected.
  useEffect(() => {
    const t = setInterval(() => void refetch(), status === "live" ? 30_000 : 5_000);
    return () => clearInterval(t);
  }, [refetch, status]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setStatus("offline");
      return;
    }
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tokenTimer: ReturnType<typeof setInterval> | null = null;
    const presenceKeyFallback = `viewer-${crypto.randomUUID()}`;

    const sampleLatency = (sentAt: unknown) => {
      if (typeof sentAt !== "number" || latencySamples.current >= 5 || Math.random() > 0.3) return;
      latencySamples.current++;
      const ms = Date.now() + clockOffset.current - sentAt;
      if (ms >= 0 && ms < 60_000) {
        void api("/api/metrics", { room: code, name: "realtime_delivery", ms }).catch(() => {});
      }
    };

    const teardown = async () => {
      if (channel) {
        const c = channel;
        channel = null;
        await sb.removeChannel(c).catch(() => {});
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || retryTimer) return;
      setStatus("reconnecting");
      const delay = Math.min(1000 * 2 ** attempt++, 15_000);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      await teardown();
      if (cancelled) return;
      let participantId: string | null = null;
      try {
        const res = await api<{ token: string; participantId: string | null }>(`/api/rooms/${code}/realtime-token`);
        participantId = res.participantId;
        await sb.realtime.setAuth(res.token);
      } catch {
        scheduleReconnect();
        return;
      }
      if (cancelled) return;
      const c = sb.channel(`room:${code}`, { config: { private: true, presence: { key: participantId ?? presenceKeyFallback } } });
      channel = c;
      c.on("broadcast", { event: BROADCAST_EVENTS.votes }, ({ payload }) => {
        sampleLatency(payload.sentAt);
        const tallies = payload.tallies as Record<string, number>;
        setState((s) =>
          s && s.round?.id === payload.roundId
            ? { ...s, proposals: s.proposals.map((p) => (p.id in tallies ? { ...p, votes: tallies[p.id]! } : p)) }
            : s,
        );
        // New ballots also add feed entries; refresh lazily so 50 voters don't cause 50 refetches.
        if (refetchTimer.current) return;
        refetchTimer.current = setTimeout(() => {
          refetchTimer.current = null;
          void refetch();
        }, 1500);
      })
        .on("broadcast", { event: BROADCAST_EVENTS.activity }, ({ payload }) => {
          sampleLatency(payload.sentAt);
          scheduleRefetch();
        })
        .on("broadcast", { event: BROADCAST_EVENTS.stateChanged }, ({ payload }) => {
          sampleLatency(payload.sentAt);
          scheduleRefetch();
        })
        .on("presence", { event: "sync" }, () => {
          const ps = c.presenceState<{ p?: boolean }>();
          setOnline(Object.values(ps).filter((metas) => metas.some((m) => m.p)).length);
        })
        .subscribe(async (st) => {
          if (c !== channel) return;
          if (st === "SUBSCRIBED") {
            attempt = 0;
            setStatus("live");
            void refetch(); // canonical state on every (re)subscribe
            if (opts.trackPresence && participantId) await c.track({ p: true });
          } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
            scheduleReconnect();
          }
        });
    };

    void connect();
    tokenTimer = setInterval(async () => {
      try {
        const fresh = await api<{ token: string }>(`/api/rooms/${code}/realtime-token`);
        await sb.realtime.setAuth(fresh.token);
      } catch {}
    }, 60 * 60_000);
    const onOnline = () => void connect();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      if (retryTimer) clearTimeout(retryTimer);
      if (tokenTimer) clearInterval(tokenTimer);
      void teardown();
    };
  }, [code, opts.trackPresence, refetch, scheduleRefetch]);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  return { state, setState, error, online, status, refetch, serverNow };
}
