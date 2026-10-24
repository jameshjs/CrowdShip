import { createHash } from "node:crypto";
import { clusterKey } from "./text";
import { deterministicTriage, templateProposal } from "./fallback";
import { anthropicTriage, openaiTriage, type LlmResult } from "./llm";
import { AUTO_MERGE_THRESHOLD, type TriageFeedback, type TriagePlan, type TriageTarget } from "./types";

export type TriageProviderName = "anthropic" | "openai" | "deterministic";

export function configuredTriageProvider(): TriageProviderName {
  const want = process.env.TRIAGE_PROVIDER;
  if (want === "deterministic") return "deterministic";
  if (want === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "deterministic";
}

// Small in-process cache: identical batches (e.g. retries) never pay twice.
const cache = new Map<string, TriagePlan>();
function cacheKey(feedback: TriageFeedback[], targets: TriageTarget[]) {
  return createHash("sha256").update(JSON.stringify([feedback, targets.map((t) => [t.id, t.title])])).digest("hex");
}

/** Convert a validated LLM response to a plan, dropping invented ids and enforcing the review threshold. */
export function planFromLlm(result: LlmResult, feedback: TriageFeedback[], targets: TriageTarget[], provider: "anthropic" | "openai"): TriagePlan {
  const plan: TriagePlan = { attach: [], create: [], ignore: [], provider };
  const seen = new Set<string>();
  const byId = new Map(feedback.map((f) => [f.id, f]));
  const resolve = (alias: string) => {
    const id = result.fAlias.get(alias);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return id;
  };
  for (const alias of result.raw.ignored) {
    const id = resolve(alias);
    if (id) plan.ignore.push(id);
  }
  for (const g of result.raw.groups) {
    const ids = g.feedbackIds.map(resolve).filter((x): x is string => Boolean(x));
    if (!ids.length) continue;
    const items = ids.map((id) => byId.get(id)!);
    const existing = g.existingProposalId ? result.pAlias.get(g.existingProposalId) : undefined;
    if (existing && g.confidence >= AUTO_MERGE_THRESHOLD) {
      plan.attach.push({ proposalId: existing, feedbackIds: ids, confidence: g.confidence });
      continue;
    }
    const proposal = g.proposal ?? templateProposal(items);
    const uncertain = g.confidence < AUTO_MERGE_THRESHOLD || Boolean(existing);
    if (existing) {
      const t = targets.find((x) => x.id === existing);
      proposal.missingDetails = [...proposal.missingDetails, `Possibly a duplicate of "${t?.title}"`].slice(0, 6);
    }
    plan.create.push({
      proposal,
      feedbackIds: ids,
      confidence: g.confidence,
      needsReview: uncertain,
      normalizedKey: clusterKey(items.map((i) => i.text).join(" ")),
    });
  }
  // Anything the model skipped goes through the deterministic path, never silently dropped.
  const leftovers = feedback.filter((f) => !seen.has(f.id));
  if (leftovers.length) {
    const rest = deterministicTriage(leftovers, targets);
    plan.attach.push(...rest.attach);
    plan.create.push(...rest.create.map((c) => ({ ...c, needsReview: true })));
    plan.ignore.push(...rest.ignore);
  }
  return plan;
}

/**
 * Triage a batch. Uses the configured LLM; on any LLM failure falls back to the
 * deterministic clusterer and reports that in plan.provider (and `fallbackReason`).
 */
export async function triage(
  feedback: TriageFeedback[],
  targets: TriageTarget[],
): Promise<TriagePlan & { fallbackReason?: string }> {
  if (!feedback.length) return { attach: [], create: [], ignore: [], provider: "deterministic" };
  const provider = configuredTriageProvider();
  if (provider === "deterministic") return deterministicTriage(feedback, targets);

  const key = cacheKey(feedback, targets);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const result = provider === "anthropic" ? await anthropicTriage(feedback, targets) : await openaiTriage(feedback, targets);
    const plan = planFromLlm(result, feedback, targets, provider);
    cache.set(key, plan);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return plan;
  } catch (err) {
    return { ...deterministicTriage(feedback, targets), fallbackReason: err instanceof Error ? err.message : String(err) };
  }
}
