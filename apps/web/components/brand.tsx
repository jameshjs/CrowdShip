import { useId } from "react";
import { cn } from "@/lib/utils";

/** The gradient sail mark from arts/CrowdShip Gradient Sail Logo.png, redrawn as SVG. */
export function SailMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 56" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sail`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4a1f5" />
          <stop offset="0.55" stopColor="#8f9cf7" />
          <stop offset="1" stopColor="#7cc0fb" />
        </linearGradient>
        <linearGradient id={`${id}-hull`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#dca4ef" />
          <stop offset="0.5" stopColor="#a693f4" />
          <stop offset="1" stopColor="#6f9cf3" />
        </linearGradient>
        <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b2bb0" />
          <stop offset="1" stopColor="#5b55d8" />
        </linearGradient>
      </defs>
      <path d="M29.6 3.2c1.4-2.5 4.4-2.5 5.8 0L53 34.3c.7 1.3-.2 2.9-1.7 2.9H12.4c-1.6 0-2.5-1.7-1.7-3z" fill={`url(#${id}-sail)`} />
      <path d="M31.8 18.5c-2.2 3.4-3.3 7.6-2.4 11.4.8 3.4 3.7 5.6 7.6 6.2l15.3 1.1c.7 0 1-.9.4-1.3-6.1-1.3-14.4-4.5-17.6-10.2-1.2-2.1-2.3-4.6-3.3-7.2z" fill={`url(#${id}-fold)`} />
      <rect x="2" y="39" width="60" height="14" rx="7" fill={`url(#${id}-hull)`} />
    </svg>
  );
}

export function Logo({ className, markClassName, textClassName }: { className?: string; markClassName?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <SailMark className={markClassName} />
      <span className={textClassName}>CrowdShip</span>
    </span>
  );
}
