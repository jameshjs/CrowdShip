import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-bg-sunken text-fg-muted border border-line",
      accent: "bg-accent-soft text-accent",
      success: "bg-success-soft text-success",
      info: "bg-info-soft text-info",
      warn: "bg-warn-soft text-warn",
      danger: "bg-danger-soft text-danger",
      demo: "bg-demo-soft text-demo border border-demo/30",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
