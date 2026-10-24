import { z } from "zod";
import { AGENT_PROVIDERS, COMPLEXITIES, FEEDBACK_TYPES, PREVIEW_RATINGS } from "./domain";

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/, "Invalid room code");

export const nicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[\p{L}\p{N} _.\-']+$/u, "Letters, numbers, spaces and _ . - ' only");

export const joinInput = z.object({
  nickname: nicknameSchema.optional(),
});

export const feedbackInput = z
  .object({
    type: z.enum(FEEDBACK_TYPES),
    text: z.string().max(1000).default(""),
    pageUrl: z.string().max(300).optional(),
    elementIdentifier: z.string().max(200).optional(),
    elementLabel: z.string().max(200).optional(),
    applicationVersion: z.string().max(40).optional(),
    deviceCategory: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional(),
    browser: z.string().max(60).optional(),
  })
  .superRefine((v, ctx) => {
    const len = v.text.trim().length;
    // Praise can be a single tap. Everything else needs some words.
    if (v.type !== "praise" && len < 3) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "Tell us a little more" });
    }
  });
export type FeedbackInput = z.infer<typeof feedbackInput>;

export const voteInput = z.object({
  proposalId: z.uuid(),
  roundId: z.uuid(),
});

export const previewReviewInput = z.object({
  proposalId: z.uuid(),
  rating: z.enum(PREVIEW_RATINGS),
  comment: z.string().max(500).default(""),
});

export const createRoomInput = z.object({
  projectName: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  githubRepository: z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "owner/repo"),
  productionUrl: z.url().optional().or(z.literal("").transform(() => undefined)),
  agentProvider: z.enum(AGENT_PROVIDERS),
  maxAcuPerSession: z.coerce.number().int().min(1).max(100).default(10),
  loadDemoSeed: z.boolean().default(true),
});

export const proposalEditInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  requirements: z.array(z.string().trim().min(1).max(300)).max(12),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).max(12),
  complexity: z.enum(COMPLEXITIES),
});

/** Structured output produced by AI triage for one cluster. */
export const triagedProposalSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(["bug", "feature", "ux", "general"]),
  description: z.string().max(1000),
  requirements: z.array(z.string().max(300)).max(10),
  acceptanceCriteria: z.array(z.string().max(300)).max(10),
  missingDetails: z.array(z.string().max(300)).max(6).default([]),
  complexity: z.enum(["small", "medium", "large"]),
});
export type TriagedProposal = z.infer<typeof triagedProposalSchema>;
