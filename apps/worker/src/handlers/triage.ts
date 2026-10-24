import { clusterKey, triage } from "@crowdship/ai";
import {
  attachFeedbackToProposal, createProposalFromTriage, getRoomById, listClusterTargets, listUntriagedFeedback, markTriaged,
  recordMetric, setTriaging, type Job,
} from "@crowdship/db";
import { log } from "../log";

export async function handleTriage(job: Job<{ roomId: string; manual?: boolean }>) {
  const room = await getRoomById(job.payload.roomId);
  try {
    const items = await listUntriagedFeedback(room.id);
    if (!items.length) return;
    const targets = await listClusterTargets(room.id);
    const started = performance.now();
    const plan = await triage(
      items.map((f) => ({ id: f.id, type: f.type, text: f.text, elementLabel: f.element_label, pageUrl: f.page_url })),
      targets.map((t) => ({ id: t.id, title: t.title, description: t.description, normalizedKey: t.normalized_key ?? clusterKey(`${t.title} ${t.description}`) })),
    );
    const ms = performance.now() - started;
    void recordMetric("triage_latency", { ms }, { provider: plan.provider, items: items.length, fallback: Boolean(plan.fallbackReason) }, room.id);
    if (plan.fallbackReason) log("warn", "LLM triage failed; used deterministic fallback", { reason: plan.fallbackReason, roomId: room.id });

    for (const a of plan.attach) await attachFeedbackToProposal(room, a.proposalId, a.feedbackIds, a.confidence);
    for (const c of plan.create) {
      await createProposalFromTriage(room, c.proposal, c.feedbackIds, {
        confidence: c.confidence,
        needsReview: c.needsReview,
        normalizedKey: c.normalizedKey,
      });
    }
    await markTriaged(plan.ignore);
    log("info", "triage applied", { roomId: room.id, attach: plan.attach.length, create: plan.create.length, ignore: plan.ignore.length, provider: plan.provider });
  } finally {
    if (job.payload.manual) await setTriaging(room, false);
  }
}
