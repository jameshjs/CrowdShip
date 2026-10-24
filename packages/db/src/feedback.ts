import { moderate, sanitizeText, type FeedbackInput, type FeedbackType } from "@crowdship/shared";
import { db } from "./client";
import { notFound } from "./errors";
import { enqueue } from "./jobs";
import { activity, stateChanged } from "./realtime";

export const TRIAGE_BATCH_SECONDS = 15;

export interface FeedbackRow {
  id: string;
  participant_id: string;
  room_id: string;
  type: FeedbackType;
  text: string;
  page_url: string | null;
  element_identifier: string | null;
  element_label: string | null;
  application_version: string | null;
  device_category: string | null;
  browser: string | null;
  moderation: "visible" | "held" | "hidden";
  triaged_at: Date | null;
  created_at: Date;
}

/** Strip query strings and fragments so tokens in URLs are never stored. */
export function safePageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, "https://placeholder.invalid");
    return sanitizeText(u.pathname, 300) || "/";
  } catch {
    return null;
  }
}

export async function submitFeedback(
  room: { id: string; code: string },
  participant: { id: string; nickname: string },
  input: FeedbackInput,
): Promise<FeedbackRow> {
  const text = sanitizeText(input.text, 1000);
  const verdict = moderate(`${text} ${participant.nickname}`);
  const moderation = verdict.ok ? "visible" : "held";
  const elementLabel = input.elementLabel ? sanitizeText(input.elementLabel, 200) : null;

  return db().begin(async (sql) => {
    const [row] = await sql<FeedbackRow[]>`
      insert into feedback (participant_id, room_id, type, text, page_url, element_identifier, element_label,
        application_version, device_category, browser, moderation,
        triaged_at)
      values (${participant.id}, ${room.id}, ${input.type}, ${text}, ${safePageUrl(input.pageUrl)},
        ${input.elementIdentifier ? sanitizeText(input.elementIdentifier, 200) : null}, ${elementLabel},
        ${input.applicationVersion ? sanitizeText(input.applicationVersion, 40) : null},
        ${input.deviceCategory ?? null}, ${input.browser ? sanitizeText(input.browser, 60) : null}, ${moderation},
        ${input.type === "praise" && text.length === 0 ? new Date() : null})
      returning *`;

    await activity(sql, room, "feedback_submitted", {
      feedbackId: row!.id,
      feedbackType: row!.type,
      nickname: moderation === "visible" ? participant.nickname : "Someone",
      text: moderation === "visible" ? text : null,
      elementLabel: moderation === "visible" ? elementLabel : null,
      held: moderation !== "visible",
    });

    if (!row!.triaged_at) {
      // Batch triage: all feedback in the same window shares one job.
      const window = Math.floor(Date.now() / (TRIAGE_BATCH_SECONDS * 1000));
      await enqueue(
        "feedback-triage",
        { roomId: room.id },
        {
          idempotencyKey: `triage:${room.id}:${window}`,
          runAt: new Date((window + 1) * TRIAGE_BATCH_SECONDS * 1000),
          sql,
        },
      );
    }
    return row!;
  });
}

export async function setFeedbackModeration(
  room: { id: string; code: string },
  feedbackId: string,
  moderation: "visible" | "hidden",
): Promise<void> {
  await db().begin(async (sql) => {
    const rows = await sql`update feedback set moderation = ${moderation} where id = ${feedbackId} and room_id = ${room.id} returning id`;
    if (!rows.length) throw notFound("Feedback");
    await sql`
      update activity_events set hidden = ${moderation === "hidden"}
      where room_id = ${room.id} and public_payload ->> 'feedbackId' = ${feedbackId}`;
    await stateChanged(sql, room.code, "moderation");
  });
}

export async function listFeedbackForAdmin(roomId: string) {
  return db()<(FeedbackRow & { nickname: string; proposal_id: string | null; confidence: number | null })[]>`
    select f.*, p.nickname, pf.proposal_id, pf.confidence
    from feedback f
    join participants p on p.id = f.participant_id
    left join proposal_feedback pf on pf.feedback_id = f.id
    where f.room_id = ${roomId}
    order by f.created_at desc limit 300`;
}

export async function listUntriagedFeedback(roomId: string) {
  return db()<FeedbackRow[]>`
    select f.* from feedback f
    where f.room_id = ${roomId} and f.triaged_at is null and f.moderation <> 'hidden'
    order by f.created_at limit 100`;
}
