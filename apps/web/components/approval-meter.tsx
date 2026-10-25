"use client";

import { motion } from "motion/react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tug-of-war between 👎 and 👍: red pulls from the left, green from the right, and the seam
 * slides as swipes come in. With no swipes the seam rests in the middle.
 */
export function ApprovalMeter({ likes, dislikes, large, className }: { likes: number; dislikes: number; large?: boolean; className?: string }) {
  const total = likes + dislikes;
  const yes = total ? (likes / total) * 100 : 50;
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={`${likes} yes, ${dislikes} no`} data-testid="approval-meter">
      <span className={cn("flex shrink-0 items-center gap-1 font-semibold tabular text-danger", large ? "w-16 text-xl" : "w-9 text-xs")}>
        <ThumbsDown className={large ? "h-5 w-5" : "h-3.5 w-3.5"} aria-hidden /> {dislikes}
      </span>
      <div className={cn("relative flex-1 overflow-hidden rounded-full bg-bg-sunken", large ? "h-4" : "h-2")}>
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#f0707f] to-[#c2507e]"
          initial={false}
          animate={{ width: `${100 - yes}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
        />
        <motion.div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-[#5fd6a4] to-[#3fae86]"
          initial={false}
          animate={{ width: `${yes}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
        />
        <motion.div
          className={cn("absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_white]", total ? "opacity-100" : "opacity-40")}
          initial={false}
          animate={{ left: `${100 - yes}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
        />
      </div>
      <span className={cn("flex shrink-0 items-center justify-end gap-1 font-semibold tabular text-success", large ? "w-16 text-xl" : "w-9 text-xs")}>
        {likes} <ThumbsUp className={large ? "h-5 w-5" : "h-3.5 w-3.5"} aria-hidden />
      </span>
    </div>
  );
}
