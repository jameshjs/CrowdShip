"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AGENT_PROVIDERS, PROVIDER_LABELS, type AgentProviderName } from "@crowdship/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client/api";
import { Logo, SailMark } from "@/components/brand";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-sm px-5 pt-24">
      <Logo className="mb-8 text-lg" markClassName="h-9 w-9" />
      <h1 className="text-2xl font-bold tracking-tight">Organizer sign in</h1>
      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/admin/login", { password });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        }}
      >
        <Input type="password" placeholder="Organizer password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password" autoFocus />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" data-testid="admin-login">Sign in</Button>
      </form>
    </main>
  );
}

type Room = { code: string; project_name: string; status: string; agent_provider: AgentProviderName; mode: "build" | "feedback"; created_at: string };

export function AdminHome({ rooms, defaults }: { rooms: Room[]; defaults: { repo: string; productionUrl: string; provider: AgentProviderName } }) {
  const router = useRouter();
  const [form, setForm] = useState({
    mode: "build" as "build" | "feedback",
    projectName: "Harbour Café",
    description: "Order-ahead app for a little café. Tell us what it should do next.",
    githubRepository: defaults.repo,
    productionUrl: defaults.productionUrl,
    agentProvider: defaults.provider,
    maxAcuPerSession: 10,
    loadDemoSeed: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-10">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight"><SailMark className="h-9 w-9" /> Organizer</h1>
        <Button variant="ghost" size="sm" onClick={async () => { await api("/api/admin/logout", {}); router.refresh(); }}>Sign out</Button>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Create a session</h2>
        <div className="mb-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Session type">
          {([
            ["build", "Build with an AI agent", "Your repo. The winning idea becomes a draft PR, verified by CI."],
            ["feedback", "Feedback & vote only", "Any website, even one you don't own. Ends with published results."],
          ] as const).map(([value, title, sub]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.mode === value}
              data-testid={`mode-${value}`}
              onClick={() => setForm({ ...form, mode: value, ...(value === "feedback" ? { projectName: "", description: "Tell us what would make this site better.", productionUrl: "" } : {}) })}
              className={cn("rounded-xl border p-3 text-left text-sm transition-colors", form.mode === value ? "border-accent/70 bg-accent-soft" : "border-line hover:border-line-strong")}
            >
              <span className="block font-semibold">{title}</span>
              <span className="text-fg-muted">{sub}</span>
            </button>
          ))}
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const { code } = await api<{ code: string }>("/api/admin/rooms", form);
              router.push(`/admin/${code}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
              setBusy(false);
            }
          }}
        >
          <label className="space-y-1 text-sm">Project name
            <Input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} data-testid="create-name" />
          </label>
          {form.mode === "build" && (
            <label className="space-y-1 text-sm">Approved GitHub repository
              <Input value={form.githubRepository} onChange={(e) => setForm({ ...form, githubRepository: e.target.value })} className="font-mono" />
            </label>
          )}
          <label className="space-y-1 text-sm sm:col-span-2">Description
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className={cn("space-y-1 text-sm", form.mode === "feedback" && "sm:col-span-2")}>{form.mode === "feedback" ? "Website to review" : "App URL (version A)"}
            <Input value={form.productionUrl} placeholder="https://…" onChange={(e) => setForm({ ...form, productionUrl: e.target.value })} data-testid="create-url" />
          </label>
          {form.mode === "build" && <>
          <label className="space-y-1 text-sm">Coding agent
            <select
              className="h-12 w-full rounded-xl border border-line bg-bg-sunken px-3"
              value={form.agentProvider}
              onChange={(e) => setForm({ ...form, agentProvider: e.target.value as AgentProviderName })}
              data-testid="create-provider"
            >
              {AGENT_PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Max ACUs per Devin session
            <Input type="number" min={1} max={100} value={form.maxAcuPerSession} onChange={(e) => setForm({ ...form, maxAcuPerSession: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" checked={form.loadDemoSeed} onChange={(e) => setForm({ ...form, loadDemoSeed: e.target.checked })} />
            Load the 5 demo proposals
          </label>
          </>}
          {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
          <Button type="submit" disabled={busy} className="sm:col-span-2" data-testid="create-room">Create session</Button>
        </form>
      </Card>

      <section>
        <h2 className="mb-3 font-semibold">Your sessions</h2>
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.code}>
              <Link href={`/admin/${r.code}`} className="flex items-center justify-between rounded-xl border border-line bg-bg-raised px-4 py-3 backdrop-blur-md hover:border-line-strong">
                <span><span className="mr-3 font-mono text-accent">{r.code}</span>{r.project_name}</span>
                {r.mode === "feedback"
                  ? <Badge tone="success">Feedback only</Badge>
                  : <Badge tone={r.agent_provider === "mock" ? "demo" : "info"}>{PROVIDER_LABELS[r.agent_provider]}</Badge>}
              </Link>
            </li>
          ))}
          {!rooms.length && <p className="text-fg-subtle">No sessions yet.</p>}
        </ul>
      </section>
    </main>
  );
}
