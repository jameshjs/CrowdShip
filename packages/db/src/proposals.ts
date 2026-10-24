import type { Complexity, ProposalStatus, TriagedProposal } from "@crowdship/shared";
import { db, type Sql } from "./client";
import { badRequest, notFound } from "./errors";
import { activity, stateChanged } from "./realtime";

export interface ProposalRow {
  id: string;
  room_id: string;
  title: string;
  description: string;
  category: string;
  requirements_json: string[];
  acceptance_criteria_json: string[];
  missing_details_json: string[];
  status: ProposalStatus;
  complexity: Complexity;
  needs_review: boolean;
  source: "triage" | "organizer" | "seed";
  normalized_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getProposal(roomId: string, id: string, sql: Sql = db()): Promise<ProposalRow> {
  const [p] = await sql<ProposalRow[]>`select * from proposals where id = ${id} and room_id = ${roomId}`;
  if (!p) throw notFound("Proposal");
  return p;
}

export async function listProposals(roomId: string) {
  return db()<(ProposalRow & { supporters: number })[]>`
    select p.*, (select count(distinct f.participant_id)::int from proposal_feedback pf
      join feedback f on f.id = pf.feedback_id where pf.proposal_id = p.id) as supporters
    from proposals p where p.room_id = ${roomId} and p.status <> 'archived'
    order by p.created_at`;
}

/** Existing open proposals, used by triage to attach new feedback to known clusters. */
export async function listClusterTargets(roomId: string) {
  return db()<Pick<ProposalRow, "id" | "title" | "description" | "normalized_key" | "status">[]>`
    select id, title, description, normalized_key, status from proposals
    where room_id = ${roomId} and status in ('suggested', 'approved')`;
}

export async function createProposalFromTriage(
  room: { id: string; code: string },
  t: TriagedProposal,
  feedbackIds: string[],
  opts: { confidence: number; needsReview: boolean; normalizedKey: string },
): Promise<string> {
  return db().begin(async (sql) => {
    const [p] = await sql<{ id: string }[]>`
      insert into proposals (room_id, title, description, category, requirements_json, acceptance_criteria_json,
        missing_details_json, complexity, needs_review, normalized_key, source)
      values (${room.id}, ${t.title}, ${t.description}, ${t.category}, ${sql.json(t.requirements)},
        ${sql.json(t.acceptanceCriteria)}, ${sql.json(t.missingDetails)}, ${t.complexity},
        ${opts.needsReview}, ${opts.normalizedKey}, 'triage')
      returning id`;
    await linkFeedback(sql, p!.id, feedbackIds, opts.confidence);
    await activity(sql, room, "proposal_created", { proposalId: p!.id, title: t.title, supporters: feedbackIds.length });
    return p!.id;
  });
}

export async function attachFeedbackToProposal(
  room: { id: string; code: string },
  proposalId: string,
  feedbackIds: string[],
  confidence: number,
): Promise<void> {
  await db().begin(async (sql) => {
    const p = await getProposal(room.id, proposalId, sql);
    await linkFeedback(sql, proposalId, feedbackIds, confidence);
    await activity(sql, room, "feedback_merged", { proposalId, title: p.title, count: feedbackIds.length });
  });
}

async function linkFeedback(sql: Sql, proposalId: string, feedbackIds: string[], confidence: number) {
  for (const fid of feedbackIds) {
    await sql`
      insert into proposal_feedback (proposal_id, feedback_id, confidence) values (${proposalId}, ${fid}, ${confidence})
      on conflict (feedback_id) do nothing`;
    await sql`update feedback set triaged_at = coalesce(triaged_at, now()) where id = ${fid}`;
  }
  await sql`update proposals set updated_at = now() where id = ${proposalId}`;
}

export async function markTriaged(feedbackIds: string[]): Promise<void> {
  if (!feedbackIds.length) return;
  await db()`update feedback set triaged_at = now() where id = any(${feedbackIds}) and triaged_at is null`;
}

// ---------------------------------------------------------------- organizer actions

export async function setProposalStatus(
  room: { id: string; code: string },
  proposalId: string,
  status: "approved" | "rejected" | "suggested",
): Promise<void> {
  await db().begin(async (sql) => {
    const p = await getProposal(room.id, proposalId, sql);
    if (!["suggested", "approved", "rejected"].includes(p.status)) {
      throw badRequest(`A ${p.status} proposal can't be changed here`);
    }
    await sql`update proposals set status = ${status}, needs_review = false, updated_at = now() where id = ${proposalId}`;
    if (status === "approved") await activity(sql, room, "proposal_approved", { proposalId, title: p.title });
    else await stateChanged(sql, room.code, "proposal");
  });
}

export async function editProposal(
  room: { id: string; code: string },
  proposalId: string,
  e: { title: string; description: string; requirements: string[]; acceptanceCriteria: string[]; complexity: Complexity },
): Promise<void> {
  await db().begin(async (sql) => {
    const p = await getProposal(room.id, proposalId, sql);
    if (!["suggested", "approved", "selected"].includes(p.status)) throw badRequest("Proposal is locked");
    await sql`
      update proposals set title = ${e.title}, description = ${e.description},
        requirements_json = ${sql.json(e.requirements)}, acceptance_criteria_json = ${sql.json(e.acceptanceCriteria)},
        complexity = ${e.complexity}, updated_at = now()
      where id = ${proposalId}`;
    await stateChanged(sql, room.code, "proposal");
  });
}

export async function createOrganizerProposal(
  room: { id: string; code: string },
  e: { title: string; description: string; requirements: string[]; acceptanceCriteria: string[]; complexity: Complexity },
): Promise<string> {
  return db().begin(async (sql) => {
    const [p] = await sql<{ id: string }[]>`
      insert into proposals (room_id, title, description, requirements_json, acceptance_criteria_json, complexity, status, source)
      values (${room.id}, ${e.title}, ${e.description}, ${sql.json(e.requirements)}, ${sql.json(e.acceptanceCriteria)},
        ${e.complexity}, 'approved', 'organizer')
      returning id`;
    await activity(sql, room, "proposal_approved", { proposalId: p!.id, title: e.title });
    return p!.id;
  });
}

/** Merge source proposals into a target: feedback links move, sources are archived. */
export async function mergeProposals(
  room: { id: string; code: string },
  targetId: string,
  sourceIds: string[],
): Promise<void> {
  const sources = sourceIds.filter((id) => id !== targetId);
  if (!sources.length) throw badRequest("Pick at least one other proposal to merge");
  await db().begin(async (sql) => {
    const target = await getProposal(room.id, targetId, sql);
    for (const sid of sources) {
      const s = await getProposal(room.id, sid, sql);
      if (!["suggested", "approved", "rejected"].includes(s.status)) throw badRequest(`"${s.title}" is locked`);
      await sql`update proposal_feedback set proposal_id = ${targetId} where proposal_id = ${sid}`;
      await sql`update proposals set status = 'archived', updated_at = now() where id = ${sid}`;
    }
    await sql`update proposals set needs_review = false, updated_at = now() where id = ${targetId}`;
    await activity(sql, room, "proposals_merged", { proposalId: targetId, title: target.title, merged: sources.length });
  });
}

/** Split one feedback item out of its cluster into its own suggested proposal. */
export async function splitFeedback(room: { id: string; code: string }, feedbackId: string): Promise<string> {
  return db().begin(async (sql) => {
    const [f] = await sql<{ id: string; text: string; type: string }[]>`
      select id, text, type from feedback where id = ${feedbackId} and room_id = ${room.id}`;
    if (!f) throw notFound("Feedback");
    await sql`delete from proposal_feedback where feedback_id = ${feedbackId}`;
    const title = f.text.length > 60 ? `${f.text.slice(0, 57)}...` : f.text || "Untitled suggestion";
    const [p] = await sql<{ id: string }[]>`
      insert into proposals (room_id, title, description, category, needs_review, source)
      values (${room.id}, ${title}, ${f.text}, ${f.type === "bug" ? "bug" : "feature"}, true, 'organizer')
      returning id`;
    await sql`insert into proposal_feedback (proposal_id, feedback_id, confidence) values (${p!.id}, ${feedbackId}, 1)`;
    await stateChanged(sql, room.code, "proposal");
    return p!.id;
  });
}

/** Move one feedback item to a different existing proposal. */
export async function moveFeedback(room: { id: string; code: string }, feedbackId: string, proposalId: string): Promise<void> {
  await db().begin(async (sql) => {
    await getProposal(room.id, proposalId, sql);
    const [f] = await sql`select id from feedback where id = ${feedbackId} and room_id = ${room.id}`;
    if (!f) throw notFound("Feedback");
    await sql`
      insert into proposal_feedback (proposal_id, feedback_id, confidence) values (${proposalId}, ${feedbackId}, 1)
      on conflict (feedback_id) do update set proposal_id = excluded.proposal_id, confidence = 1`;
    await sql`update feedback set triaged_at = coalesce(triaged_at, now()) where id = ${feedbackId}`;
    await stateChanged(sql, room.code, "proposal");
  });
}
