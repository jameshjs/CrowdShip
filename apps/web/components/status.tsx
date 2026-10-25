"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FlaskConical, Check, Loader2, X, Minus } from "lucide-react";
import type { AgentState, CheckStatus, PublicAgentSession, RoundStatus } from "@crowdship/shared";
import { PIPELINE_STAGES, pipelineStageFor, PROVIDER_LABELS } from "@crowdship/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DemoModeBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={className} title="Agent execution in this room is simulated by the mock provider">
      <FlaskConical className="h-3 w-3" aria-hidden /> Demo mode: simulated agent
    </Badge>
  );
}

export function useNow(intervalMs = 1000, serverNow?: () => number) {
  const [now, setNow] = useState(() => (serverNow ? serverNow() : Date.now()));
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow ? serverNow() : Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, serverNow]);
  return now;
}

export function Countdown({ endsAt, now, className }: { endsAt: string; now: number; className?: string }) {
  const left = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className={cn("font-mono tabular", left <= 10 && left > 0 && "text-warn", className)} aria-live="off">
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

export const roundStatusLabel: Record<RoundStatus, string> = {
  collecting: "Collecting ideas",
  triaging: "AI triage",
  voting: "Voting open",
  selected: "Winner selected",
  developing: "Agent coding",
  verifying: "CI verification",
  review_ready: "Ready for review",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const agentStateLabel: Record<AgentState, string> = {
  queued: "Queued",
  launching: "Launching",
  running: "Coding",
  pr_opened: "PR opened",
  finished: "Agent finished",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_reconcile: "Checking launch status",
};

export function CheckIcon({ status, className }: { status: CheckStatus; className?: string }) {
  if (status === "pass") return <Check className={cn("h-4 w-4 text-success", className)} aria-label="passed" />;
  if (status === "fail") return <X className={cn("h-4 w-4 text-danger", className)} aria-label="failed" />;
  if (status === "pending") return <Loader2 className={cn("h-4 w-4 animate-spin text-warn", className)} aria-label="pending" />;
  return <Minus className={cn("h-4 w-4 text-fg-subtle", className)} aria-label="unavailable" />;
}

/** The development cycle. Stage reflects the real round state from the server. */
export function Pipeline({ status, agent, vertical, large }: { status: RoundStatus | null; agent: PublicAgentSession | null; vertical?: boolean; large?: boolean }) {
  const current = pipelineStageFor(status);
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === current);
  const failed = agent?.state === "failed" || (agent?.verification?.ciStatus === "fail" && status === "verifying");
  const done = status === "completed";
  return (
    <ol className={cn("flex", vertical ? "flex-col gap-2" : "items-stretch gap-2")} aria-label="Development pipeline">
      {PIPELINE_STAGES.map((stage, i) => {
        const isActive = i === idx && !done;
        const isDone = i < idx || done;
        const isFailed = isActive && failed;
        const label = stage.key === "coding" && agent ? `${PROVIDER_LABELS[agent.provider]} coding` : stage.label;
        return (
          <li key={stage.key} className={cn("relative flex-1", vertical && "flex items-center gap-3")}>
            <motion.div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 transition-colors duration-500",
                large ? "py-4" : "py-2.5",
                isFailed ? "border-danger/50 bg-danger-soft text-danger"
                  : isActive ? "border-accent/60 bg-accent-soft text-accent"
                  : isDone ? "border-line bg-bg-raised text-fg"
                  : "border-line/60 bg-bg-sunken text-fg-subtle",
                vertical && "w-full",
              )}
              animate={isActive ? { scale: [1, 1.02, 1] } : { scale: 1 }}
              transition={isActive ? { duration: 2, repeat: Infinity } : { duration: 0.3 }}
            >
              <span
                className={cn(
                  "grid shrink-0 place-items-center rounded-full font-mono text-xs",
                  large ? "h-7 w-7" : "h-5 w-5",
                  isFailed ? "bg-danger text-bg" : isActive ? "bg-accent text-accent-fg animate-pulse-ring" : isDone ? "bg-fg/90 text-bg" : "bg-line text-fg-subtle",
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : isFailed ? <X className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn("font-medium uppercase tracking-wide", large ? "text-sm" : "text-[11px] leading-tight")}>{label}</span>
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}
