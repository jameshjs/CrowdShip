import Link from "next/link";
import { ArrowRight, Bot, Lightbulb, Rocket } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Lightbulb, title: "Suggest", body: "Report bugs and pitch ideas from your phone, right inside the app.", tone: "from-[#7a7cf0] to-[#5b8df5]" },
  { icon: Bot, title: "AI builds", body: "The crowd votes, and a coding agent opens a tested pull request.", tone: "from-[#8b6cf0] to-[#5f62e0]" },
  { icon: Rocket, title: "Live in the app", body: "Try the new version, rate it, and the next round begins.", tone: "from-[#d17ee8] to-[#8e6cf0]" },
];

export default function Home() {
  return (
    <main className="bg-grid min-h-dvh">
      <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Logo className="text-xl" markClassName="h-9 w-9" />
          <h1 className="mt-10 text-5xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Your users <br />
            <span className="text-brand-gradient">build what&apos;s next.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-fg-muted">
            Suggest. Vote. Watch AI turn ideas into real features. A human approves every step.
          </p>
          <form action="/join" className="mt-9 flex max-w-md gap-2">
            <Input name="code" placeholder="Room code, e.g. 4821" aria-label="Room code" className="h-14 font-mono uppercase" maxLength={8} autoCapitalize="characters" required />
            <button className={cn(buttonVariants({ size: "lg" }))} type="submit">Join <ArrowRight className="h-4 w-4" /></button>
          </form>
          <Link href="/admin" className="mt-5 inline-block text-sm text-fg-subtle hover:text-fg">Organizer? Sign in →</Link>
        </div>

        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hero.png"
            alt="The CrowdShip app on a phone: give feedback, suggest a feature, report a bug"
            className="glow-brand aspect-[16/9] w-full rounded-3xl object-cover"
          />
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="glass rounded-2xl border border-line p-4">
                <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg", s.tone)}>
                  <s.icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-3 font-semibold">{i + 1}. {s.title}</p>
                <p className="mt-1 text-sm text-fg-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
