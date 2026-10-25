"use client";

import { useState } from "react";
import { ArrowBigDown, ArrowBigUp, Wrench } from "lucide-react";
import type { PreviewRating } from "@crowdship/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TryAppButton } from "@/components/try-app";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const OPTIONS: { value: PreviewRating; label: string; icon: React.ElementType }[] = [
  { value: "yes", label: "Yes", icon: ArrowBigUp },
  { value: "no", label: "No", icon: ArrowBigDown },
  { value: "needs_improvement", label: "Needs work", icon: Wrench },
];

export function PreviewReview({ code, proposalId, previewUrl, productionUrl, current }: {
  code: string; proposalId: string; previewUrl: string; productionUrl: string | null; current: string | null;
}) {
  const [rating, setRating] = useState<PreviewRating | null>((current as PreviewRating) ?? null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(Boolean(current));
  const [error, setError] = useState<string | null>(null);

  async function submit(r: PreviewRating, withComment = false) {
    setRating(r);
    setError(null);
    try {
      await api(`/api/rooms/${code}/preview-review`, { proposalId, rating: r, comment: withComment ? comment : "" });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <Card className="border-accent/40 p-4" data-testid="preview-review">
      <p className="text-xs uppercase tracking-wide text-accent">Preview ready</p>
      <p className="mt-1 font-semibold">Compare the two versions</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {productionUrl ? (
          <TryAppButton code={code} url={productionUrl} variant="secondary" size="md">A · Original</TryAppButton>
        ) : <span />}
        <TryAppButton code={code} url={previewUrl} size="md">B · AI-built</TryAppButton>
      </div>
      <p className="mt-4 text-sm font-medium">Did this change improve the app?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              onClick={() => submit(o.value)}
              data-testid={`rate-${o.value}`}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm transition-colors",
                rating === o.value ? "border-accent bg-accent-soft text-accent" : "border-line bg-bg-sunken text-fg-muted",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden /> {o.label}
            </button>
          );
        })}
      </div>
      {sent && rating && (
        <div className="mt-3 space-y-2">
          <Textarea rows={2} maxLength={500} placeholder="Anything to add? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          {comment.trim() && <Button size="sm" variant="secondary" onClick={() => submit(rating, true)}>Send comment</Button>}
          <p className="text-xs text-accent">Thanks, your rating is saved.</p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
