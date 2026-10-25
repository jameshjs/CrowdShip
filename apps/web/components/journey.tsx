import { Check } from "lucide-react";
import { journeyStep, type RoundStatus } from "@crowdship/shared";
import { cn } from "@/lib/utils";

const STEPS = ["Ideas", "Vote", "Build", "Try it"] as const;

export function Journey({ status, previewReleased }: { status: RoundStatus | null; previewReleased: boolean }) {
  const { index, done } = journeyStep(status, previewReleased);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Round progress" data-testid="journey">
      {STEPS.map((label, i) => {
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
