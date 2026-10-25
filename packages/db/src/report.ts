import { db } from "./client";
import { getRoomById } from "./rooms";

export interface ResultsReport {
  projectName: string;
  website: string | null;
  roomCode: string;
  round: { number: number; status: string; closedAt: Date | null } | null;
  totals: { participants: number; feedback: number; votes: number };
  ranked: {
    rank: number;
    title: string;
    description: string;
    requirements: string[];
    votes: number;
    supporters: number;
    winner: boolean;
    quotes: { nickname: string; text: string; where: string | null }[];
  }[];
}

/** Ranked results for one round (default: the most recent round that had a ballot). Visible feedback only. */
export async function buildResultsReport(roomId: string, roundNumber?: number): Promise<ResultsReport> {
  const sql = db();
  const room = await getRoomById(roomId);
  const [round] = await sql<{ id: string; number: number; status: string; closed_at: Date | null; winning_proposal_id: string | null }[]>`
    select r.id, r.number, r.status, r.closed_at, r.winning_proposal_id from voting_rounds r
    where r.room_id = ${roomId}
      and exists (select 1 from round_proposals rp where rp.round_id = r.id)
      ${roundNumber ? sql`and r.number = ${roundNumber}` : sql``}
    order by r.number desc limit 1`;
  const [totals] = await sql<{ participants: number; feedback: number }[]>`
    select (select count(*)::int from participants where room_id = ${roomId}) as participants,
           (select count(*)::int from feedback where room_id = ${roomId} and moderation = 'visible') as feedback`;
  if (!round) return { projectName: room.project_name, website: room.production_url, roomCode: room.code, round: null, totals: { ...totals!, votes: 0 }, ranked: [] };

  const rows = await sql<{ id: string; title: string; description: string; requirements_json: string[]; votes: number; supporters: number }[]>`
    select p.id, p.title, p.description, p.requirements_json,
      (select count(*)::int from votes v where v.round_id = ${round.id} and v.proposal_id = p.id) as votes,
      (select count(distinct f.participant_id)::int from proposal_feedback pf join feedback f on f.id = pf.feedback_id
        where pf.proposal_id = p.id and f.moderation = 'visible') as supporters
    from round_proposals rp join proposals p on p.id = rp.proposal_id
    where rp.round_id = ${round.id}
    order by votes desc, supporters desc, p.title`;
  const quotes = await sql<{ proposal_id: string; nickname: string; text: string; element_label: string | null }[]>`
    select pf.proposal_id, pa.nickname, f.text, f.element_label
    from proposal_feedback pf join feedback f on f.id = pf.feedback_id and f.moderation = 'visible' and f.text <> ''
    join participants pa on pa.id = f.participant_id
    where pf.proposal_id in ${sql(rows.map((r) => r.id).concat("00000000-0000-0000-0000-000000000000"))}
    order by f.created_at`;
  return {
    projectName: room.project_name,
    website: room.production_url,
    roomCode: room.code,
    round: { number: round.number, status: round.status, closedAt: round.closed_at },
    totals: { ...totals!, votes: rows.reduce((n, r) => n + r.votes, 0) },
    ranked: rows.map((r, i) => ({
      rank: i + 1,
      title: r.title,
      description: r.description,
      requirements: r.requirements_json,
      votes: r.votes,
      supporters: r.supporters,
      winner: r.id === round.winning_proposal_id,
      quotes: quotes.filter((q) => q.proposal_id === r.id).slice(0, 3).map((q) => ({ nickname: q.nickname, text: q.text, where: q.element_label })),
    })),
  };
}
