import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-line bg-bg-sunken px-4 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-line bg-bg-sunken px-4 py-3 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none resize-none",
        className,
      )}
      {...props}
    />
  );
}
