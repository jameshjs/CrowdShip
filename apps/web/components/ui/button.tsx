import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background,color,transform,opacity,filter] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent select-none",
  {
    variants: {
      variant: {
        primary: "bg-brand-gradient text-accent-fg shadow-[0_8px_30px_-8px_oklch(0.6_0.18_290/0.7)] hover:brightness-110 [text-shadow:0_1px_1px_oklch(0.3_0.1_285/0.35)]",
        secondary: "bg-bg-raised text-fg border border-line backdrop-blur-md hover:border-line-strong",
        ghost: "text-fg-muted hover:text-fg hover:bg-bg-raised",
        danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-14 px-5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
