import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background,color,transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent/90",
        secondary: "bg-bg-raised text-fg border border-line hover:border-line-strong",
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
