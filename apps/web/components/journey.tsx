import { Check } from "lucide-react";
import { journeyStep, type RoomMode, type RoundStatus } from "@crowdship/shared";
import { cn } from "@/lib/utils";

const STEPS = { build: ["Ideas", "Vote", "Build", "Try it"], feedback: ["Ideas", "Vote", "Results"] } as const;

export function Journey({ status, previewReleased, mode = "build" }: { status: RoundStatus | null; previewReleased: boolean; mode?: RoomMode }) {
  const { index, done } = journeyStep(status, previewReleased, mode);
  const steps = STEPS[mode];
  return (
    <ol className={cn("grid gap-1.5", steps.length === 3 ? "grid-cols-3" : "grid-cols-4")} aria-label="Round progress" data-testid="journey">
      {steps.map((label, i) => {
        const complete = done || i < index;
        const current = !done && i === index;
        return (
          <li key={label} className="space-y-1.5" aria-current={current ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full", complete ? "bg-brand-gradient" : current ? "bg-brand-gradient animate-pulse" : "bg-line")} />
            <p className={cn("flex items-center gap-1 text-[11px] font-medium", complete || current ? "text-fg" : "text-fg-subtle")}>
              {complete && <Check className="h-3 w-3 text-success" aria-hidden />}
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
