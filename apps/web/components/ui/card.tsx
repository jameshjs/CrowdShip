import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-bg-raised backdrop-blur-md shadow-[inset_0_1px_0_oklch(1_0_0/0.06)]", className)} {...props} />;
}
