"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { PROVIDER_LABELS, type PublicProposal, type PublicRoomState } from "@crowdship/shared";
import { useRoom } from "@/lib/client/use-room";
import { SailMark } from "@/components/brand";
import { QrButton } from "@/components/big-qr";
import { agentStateLabel, DemoModeBadge } from "@/components/status";

const C = {
  purple: { fill: "#8b6cf0", soft: "rgba(139,108,240,.16)", ring: "#b49cff" },
  blue: { fill: "#5b8df5", soft: "rgba(91,141,245,.16)", ring: "#8fb4ff" },
  green: { fill: "#3fbf8c", soft: "rgba(63,191,140,.16)", ring: "#7ee0b6" },
};
const W = 1920, TOP = 250, ROW = 104, COL = { root: 150, idea: 560, agent: 1090, ready: 1560 };

type Stage = "idea" | "agent" | "ready";
type Row = { p: PublicProposal; stage: Stage; agentLabel: string | null; readyLabel: string | null };

/** How far each idea has travelled: purple (suggested) → blue (agent working) → green (tested, ready). */
function rowsFor(state: PublicRoomState): Row[] {
  const feedbackMode = state.room.mode === "feedback";
  const winnerId = state.round?.winningProposalId;
  const rows = state.proposals
    .filter((p) => p.status !== "archived")
    .map((p): Row => {
      const isWinner = p.id === winnerId;
      const agent = isWinner ? state.agent : null;
      if (p.status === "completed") return { p, stage: "ready", agentLabel: feedbackMode ? null : "Built by the agent", readyLabel: feedbackMode ? "Top pick · published" : "Shipped" };
      if (p.status === "review_ready" || (isWinner && state.round?.status === "review_ready")) {
        return { p, stage: "ready", agentLabel: agent ? `${PROVIDER_LABELS[agent.provider]} · PR #${agent.prNumber ?? "?"}` : "Agent", readyLabel: agent?.previewReleased ? "Live for testers" : "Tested · ready for review" };
      }
      if (["developing", "verifying"].includes(p.status) || (isWinner && ["developing", "verifying"].includes(state.round?.status ?? ""))) {
        const label = agent ? `${PROVIDER_LABELS[agent.provider]} · ${state.round?.status === "verifying" ? "CI checks" : agentStateLabel[agent.state]}` : "Agent starting";
        return { p, stage: "agent", agentLabel: label, readyLabel: null };
      }
      return { p, stage: "idea", agentLabel: null, readyLabel: null };
    });
  const order = { ready: 0, agent: 1, idea: 2 };
  return rows.sort((a, b) => order[a.stage] - order[b.stage] || b.p.supporters - a.p.supporters || b.p.approval.likes - a.p.approval.likes).slice(0, 7);
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};

export function IdeaTree({ code, qrSvg, joinUrl }: { code: string; qrSvg: string; joinUrl: string }) {
  const { state } = useRoom(code);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "t" || e.key === "T") router.push(`/room/${code}/live`); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, router]);
  if (!state) return <div className="grid min-h-dvh place-items-center text-fg-muted">Connecting…</div>;

  const rows = rowsFor(state);
  const rootY = TOP + ((rows.length - 1) * ROW) / 2;
  const H = Math.max(TOP + rows.length * ROW + 80, 760);
  const counts = { idea: rows.filter((r) => r.stage === "idea").length, agent: rows.filter((r) => r.stage === "agent").length, ready: rows.filter((r) => r.stage === "ready").length };

  return (
    <div className="bg-grid min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1800px] flex-col gap-4 p-6 lg:p-8">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <SailMark className="h-14 w-14" />
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-fg-subtle"><span className="text-brand-gradient font-semibold">CrowdShip</span> idea tree</p>
              <h1 className="text-3xl font-bold tracking-tight">{state.room.projectName}</h1>
            </div>
            {state.room.demoMode && <DemoModeBadge className="ml-2 text-sm" />}
          </div>
          <div className="flex items-center gap-5">
            <a href={`/room/${code}/live`} className="rounded-xl border border-line px-3 py-2 text-sm text-fg-muted hover:text-fg">Live dashboard (T)</a>
            <div className="text-right">
              <p className="text-sm text-fg-muted">Join with code</p>
              <p className="font-mono text-4xl font-bold tracking-[0.15em]">{code}</p>
            </div>
            <QrButton qrSvg={qrSvg} joinUrl={joinUrl} code={code} className="h-28 w-28" hotkey />
          </div>
        </header>

        <ul className="flex flex-wrap gap-3 text-sm" aria-label="Legend" data-testid="tree-legend">
          <Legend color={C.purple.fill} title="User suggestions" sub="Ideas and feature requests from the crowd" n={counts.idea} />
          {state.room.mode === "build" && <Legend color={C.blue.fill} title="AI agents at work" sub="Investigating and implementing the change" n={counts.agent} />}
          <Legend color={C.green.fill} title="Tested & ready" sub={state.room.mode === "build" ? "Verified features ready for users" : "Published top picks"} n={counts.ready} />
        </ul>

        <div className="glass flex-1 overflow-hidden rounded-3xl border border-line">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Idea tree: suggestions branching into agent work and tested features" data-testid="idea-tree">
            {/* column captions */}
            {[["Ideas", COL.idea, C.purple.ring], ...(state.room.mode === "build" ? [["Agent", COL.agent, C.blue.ring] as const] : []), ["Ready", COL.ready, C.green.ring]].map(([t, x, c]) => (
              <text key={String(t)} x={Number(x)} y={TOP - 90} textAnchor="middle" fill={String(c)} fontSize="20" fontWeight="700" letterSpacing="4">{String(t).toUpperCase()}</text>
            ))}
            {/* root */}
            <g>
              <circle cx={COL.root} cy={rootY} r="46" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
              <text x={COL.root} y={rootY + 5} textAnchor="middle" fill="#f4f1fd" fontSize="18" fontWeight="700">{state.room.mode === "build" ? "Your app" : "The site"}</text>
              <text x={COL.root} y={rootY + 74} textAnchor="middle" fill="#9a91c2" fontSize="15">{state.stats.participants} people · {state.stats.feedback} feedback</text>
            </g>
            {rows.length === 0 && (
              <text x={W / 2} y={rootY} textAnchor="middle" fill="#9a91c2" fontSize="26">Waiting for the first ideas… scan the QR to add one.</text>
            )}
            {rows.map((r, i) => {
              const y = TOP + i * ROW;
              const ideaR = 18 + Math.min(14, r.p.supporters * 3);
              const toX = state.room.mode === "build" ? COL.agent : COL.ready;
              return (
                <g key={r.p.id} data-testid={`tree-row-${r.stage}`}>
                  <motion.path d={curve(COL.root + 46, rootY, COL.idea - ideaR, y)} fill="none" stroke={C.purple.ring} strokeOpacity=".45" strokeWidth="2.5"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: i * 0.06 }} />
                  {/* supporter dots: the people behind the idea */}
                  {Array.from({ length: Math.min(8, r.p.supporters) }).map((_, k) => (
                    <motion.circle key={k} cx={COL.idea - ideaR - 26 - (k % 4) * 14} cy={y - 14 + Math.floor(k / 4) * 22} r="5" fill={C.purple.fill} fillOpacity=".75"
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + k * 0.05 }} />
                  ))}
                  <Node x={COL.idea} y={y} r={ideaR} color={C.purple} delay={i * 0.06} pulse={r.stage === "idea" && r.p.id === state.round?.winningProposalId} />
                  <text x={COL.idea + ideaR + 16} y={y - 4} fill="#f4f1fd" fontSize="21" fontWeight="600">{clip(r.p.title, 34)}</text>
                  <text x={COL.idea + ideaR + 16} y={y + 22} fill="#9a91c2" fontSize="15">
                    {r.p.supporters} suggested{r.p.approval.likes + r.p.approval.dislikes ? ` · 👍 ${r.p.approval.likes} 👎 ${r.p.approval.dislikes}` : ""}{r.p.votes ? ` · ${r.p.votes} votes` : ""}
                  </text>

                  {r.stage !== "idea" && state.room.mode === "build" && r.agentLabel && (
                    <>
                      <motion.path d={curve(COL.idea + 290, y, toX - 22, y)} fill="none" stroke={C.blue.ring} strokeWidth="3" strokeDasharray={r.stage === "agent" ? "10 8" : undefined}
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1, strokeDashoffset: r.stage === "agent" ? [0, -36] : 0 }}
                        transition={{ pathLength: { duration: 0.9 }, strokeDashoffset: { duration: 1.2, repeat: Infinity, ease: "linear" } }} />
                      <Node x={COL.agent} y={y} r={22} color={C.blue} delay={0.4} pulse={r.stage === "agent"} icon="🤖" />
                      <text x={COL.agent + 38} y={y + 6} fill="#cfe0ff" fontSize="17">{clip(r.agentLabel, 30)}</text>
                    </>
                  )}
                  {r.stage === "ready" && r.readyLabel && (
                    <>
                      <motion.path d={curve((state.room.mode === "build" ? COL.agent + 250 : COL.idea + 290), y, COL.ready - 22, y)} fill="none" stroke={C.green.ring} strokeWidth="3"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.3 }} />
                      <Node x={COL.ready} y={y} r={24} color={C.green} delay={0.7} icon="✓" />
                      <text x={COL.ready + 40} y={y + 6} fill="#c9f5e2" fontSize="17" fontWeight="600">{clip(r.readyLabel, 24)}</text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function Node({ x, y, r, color, delay, pulse, icon }: { x: number; y: number; r: number; color: { fill: string; soft: string; ring: string }; delay: number; pulse?: boolean; icon?: string }) {
  return (
    <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay }} style={{ transformOrigin: `${x}px ${y}px` }}>
      {pulse && (
        <motion.circle cx={x} cy={y} r={r} fill="none" stroke={color.ring} strokeWidth="3"
          animate={{ r: [r, r + 18], opacity: [0.8, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
      )}
      <circle cx={x} cy={y} r={r + 8} fill={color.soft} />
      <circle cx={x} cy={y} r={r} fill={color.fill} stroke={color.ring} strokeWidth="2" />
      {icon && <text x={x} y={y + 7} textAnchor="middle" fontSize={r} fill="#fff">{icon}</text>}
    </motion.g>
  );
}

function Legend({ color, title, sub, n }: { color: string; title: string; sub: string; n: number }) {
  return (
    <li className="glass flex items-center gap-3 rounded-2xl border border-line px-4 py-2.5">
      <span className="h-4 w-4 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} aria-hidden />
      <span>
        <span className="font-semibold">{title}</span> <span className="tabular text-fg-subtle">({n})</span>
        <span className="block text-xs text-fg-muted">{sub}</span>
      </span>
    </li>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
