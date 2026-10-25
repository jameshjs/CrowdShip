"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bug, HelpCircle, Lightbulb, Heart, Send, Check, X } from "lucide-react";
import type { FeedbackType } from "@crowdship/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { browserName, deviceCategory } from "@/lib/client/device";
import { cn } from "@/lib/utils";
import { useRoomCtx } from "../room-shell";

const QUICK: { type: FeedbackType; label: string; hint: string; icon: React.ElementType; tone: string; textRequired: boolean }[] = [
  { type: "bug", label: "Something is broken", hint: "What happened? What did you expect?", icon: Bug, tone: "from-[#f0707f] to-[#b8467c]", textRequired: true },
  { type: "confusing", label: "This is confusing", hint: "What was confusing?", icon: HelpCircle, tone: "from-[#6fb2f7] to-[#5b6ee8]", textRequired: true },
  { type: "feature", label: "I have an idea", hint: "Describe your idea. What should the app do?", icon: Lightbulb, tone: "from-[#f7c95c] to-[#e08a3c]", textRequired: true },
  { type: "praise", label: "I like this", hint: "What do you like? (optional)", icon: Heart, tone: "from-[#e88be0] to-[#9a6cf0]", textRequired: false },
];

export default function FeedbackPage() {
  const { code } = useRoomCtx();
  const [selected, setSelected] = useState<(typeof QUICK)[number] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ held: boolean } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = selected && (!selected.textRequired || text.trim().length >= 3);

  async function send() {
    if (!selected || !canSend) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ held: boolean }>(`/api/rooms/${code}/feedback`, {
        type: selected.type,
        text: text.trim(),
        deviceCategory: deviceCategory(),
        browser: browserName(),
      });
      setSent(res);
      setSelected(null);
      setText("");
      setTimeout(() => setSent(null), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Give feedback</h1>
        <p className="text-sm text-fg-muted">AI groups similar ideas into proposals you can vote on.</p>
      </div>

      <AnimatePresence>
        {sent && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success"
            role="status"
            data-testid="feedback-sent"
          >
            <Check className="h-4 w-4" /> {sent.held ? "Thanks! It'll show publicly after a quick review." : "Thanks! Your feedback is in."}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3">
        {QUICK.map((q) => {
          const Icon = q.icon;
          const active = selected?.type === q.type;
          return (
            <button
              key={q.type}
              data-testid={`quick-${q.type}`}
              onClick={() => {
                setSelected(q);
                setError(null);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              aria-pressed={active}
              className={cn(
                "flex min-h-28 flex-col items-start justify-between rounded-2xl border p-4 text-left backdrop-blur-md transition-colors",
                active ? "border-accent/70 bg-accent-soft glow-brand" : "border-line bg-bg-raised hover:border-line-strong",
              )}
            >
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg", q.tone)}><Icon className="h-5 w-5" aria-hidden /></span>
              <span className="text-[15px] font-medium leading-tight">{q.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-2xl border border-line bg-bg-raised p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{selected.label}</p>
                <button onClick={() => setSelected(null)} className="text-fg-subtle" aria-label="Cancel"><X className="h-4 w-4" /></button>
              </div>
              <Textarea
                ref={inputRef}
                data-testid="feedback-text"
                rows={3}
                maxLength={1000}
                placeholder={selected.hint}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                }}
              />
              {error && <p className="text-sm text-danger" role="alert">{error}</p>}
              <Button size="lg" className="w-full" onClick={send} disabled={!canSend || busy} data-testid="feedback-submit">
                {busy ? "Sending…" : "Send"} <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-fg-subtle">
        Tip: open <span className="text-fg-muted">Try the app</span> and tap the feedback button there to point at a specific part of the screen.
      </p>
    </div>
  );
}
