import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="bg-grid min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
        <div className="mb-8 flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">C</span> CrowdShip</div>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Suggest it. Vote on it. Watch an agent ship it.</h1>
        <p className="mt-4 text-lg text-fg-muted">
          The crowd turns feedback into proposals, votes on what to build, and a coding agent opens a verified pull request. A human approves every step.
        </p>
        <form action="/join" className="mt-10 flex gap-2">
          <Input name="code" placeholder="Room code" className="h-14 font-mono uppercase" maxLength={8} autoCapitalize="characters" required />
          <button className={cn(buttonVariants({ size: "lg" }))} type="submit">Join <ArrowRight className="h-4 w-4" /></button>
        </form>
        <Link href="/admin" className="mt-6 text-sm text-fg-subtle hover:text-fg">Organizer? Sign in →</Link>
      </div>
    </main>
  );
}
