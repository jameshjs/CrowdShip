import type { AgentProviderName, RoomMode } from "@crowdship/shared";
import { randomInt } from "node:crypto";
import { db, type Sql } from "./client";
import { notFound } from "./errors";
import { activity } from "./realtime";
import { PermanentJobError } from "./jobs";
import { DEMO_SEED_PROPOSALS } from "./seed-data";

export interface RoomRow {
  id: string;
  project_id: string;
  code: string;
  status: "active" | "closed";
  agent_provider: AgentProviderName;
  mode: RoomMode;
  max_acu_per_session: number;
  max_sessions_total: number;
  agent_paused: boolean;
  created_at: Date;
  project_name: string;
  project_description: string;
  github_repository: string | null;
  production_url: string | null;
  organizer_id: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRoomCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export async function getRoomByCode(code: string, sql: Sql = db()): Promise<RoomRow> {
  const [room] = await sql<RoomRow[]>`
    select r.*, p.name as project_name, p.description as project_description,
      p.github_repository, p.production_url, p.organizer_id
    from rooms r join projects p on p.id = r.project_id
    where r.code = ${code}`;
  if (!room) throw notFound("Room");
  return room;
}

export async function getRoomById(id: string, sql: Sql = db()): Promise<RoomRow> {
  const [room] = await sql<RoomRow[]>`
    select r.*, p.name as project_name, p.description as project_description,
      p.github_repository, p.production_url, p.organizer_id
    from rooms r join projects p on p.id = r.project_id
    where r.id = ${id}`;
  if (!room) throw notFound("Room");
  return room;
}

export async function createRoom(input: {
  organizerId: string;
  projectName: string;
  description: string;
  mode?: RoomMode;
  githubRepository?: string;
  productionUrl?: string;
  agentProvider: AgentProviderName;
  maxAcuPerSession: number;
  loadDemoSeed: boolean;
}): Promise<RoomRow> {
  return db().begin(async (sql) => {
    const [project] = await sql<{ id: string }[]>`
      insert into projects (name, description, github_repository, production_url, organizer_id)
      values (${input.projectName}, ${input.description}, ${input.githubRepository ?? null}, ${input.productionUrl ?? null}, ${input.organizerId})
      returning id`;
    let roomId: string | undefined;
    for (let attempt = 0; attempt < 5 && !roomId; attempt++) {
      const rows = await sql<{ id: string }[]>`
        insert into rooms (project_id, code, agent_provider, mode, max_acu_per_session)
        values (${project!.id}, ${generateRoomCode()}, ${input.agentProvider}, ${input.mode ?? "build"}, ${input.maxAcuPerSession})
        on conflict (code) do nothing returning id`;
      roomId = rows[0]?.id;
    }
    if (!roomId) throw new Error("Could not allocate a room code");
    await sql`insert into voting_rounds (room_id, number, status) values (${roomId}, 1, 'collecting')`;
    if (input.loadDemoSeed) await insertSeedProposals(sql, roomId);
    const room = await getRoomById(roomId, sql);
    await activity(sql, room, "room_created", { projectName: room.project_name });
    return room;
  });
}

export async function insertSeedProposals(sql: Sql, roomId: string): Promise<void> {
  for (const p of DEMO_SEED_PROPOSALS) {
    await sql`
      insert into proposals (room_id, title, description, requirements_json, acceptance_criteria_json, complexity, status, source)
      values (${roomId}, ${p.title}, ${p.description}, ${sql.json(p.requirements)}, ${sql.json(p.acceptanceCriteria)},
        ${p.complexity}, 'approved', 'seed')`;
  }
}

export async function listRoomsForOrganizer(organizerId: string) {
  return db()<{ code: string; project_name: string; status: string; agent_provider: AgentProviderName; mode: RoomMode; created_at: Date }[]>`
    select r.code, p.name as project_name, r.status, r.agent_provider, r.mode, r.created_at
    from rooms r join projects p on p.id = r.project_id
    where p.organizer_id = ${organizerId}
    order by r.created_at desc limit 50`;
}

export async function updateRoomSettings(
  roomId: string,
  s: { maxAcuPerSession?: number; maxSessionsTotal?: number; agentPaused?: boolean },
): Promise<void> {
  await db()`
    update rooms set
      max_acu_per_session = coalesce(${s.maxAcuPerSession ?? null}, max_acu_per_session),
      max_sessions_total = coalesce(${s.maxSessionsTotal ?? null}, max_sessions_total),
      agent_paused = coalesce(${s.agentPaused ?? null}, agent_paused)
    where id = ${roomId}`;
}

// ---------------------------------------------------------------- participants

export interface ParticipantRow {
  id: string;
  room_id: string;
  nickname: string;
  guest_session_id: string;
  joined_at: Date;
}

/** Idempotent join: the same guest session re-joining keeps its participant row. */
export async function joinRoom(
  room: { id: string; code: string },
  guestSessionId: string,
  nickname: string,
): Promise<{ participant: ParticipantRow; isNew: boolean }> {
  return db().begin(async (sql) => {
    const existing = await sql<ParticipantRow[]>`
      select * from participants where room_id = ${room.id} and guest_session_id = ${guestSessionId}`;
    if (existing[0]) {
      await sql`update participants set last_seen_at = now() where id = ${existing[0].id}`;
      return { participant: existing[0], isNew: false };
    }
    const [participant] = await sql<ParticipantRow[]>`
      insert into participants (room_id, nickname, guest_session_id)
      values (${room.id}, ${nickname}, ${guestSessionId})
      on conflict (room_id, guest_session_id) do update set last_seen_at = now()
      returning *`;
    await activity(sql, room, "participant_joined", { nickname });
    return { participant: participant!, isNew: true };
  });
}

export async function getParticipant(roomId: string, guestSessionId: string): Promise<ParticipantRow | null> {
  const rows = await db()<ParticipantRow[]>`
    select * from participants where room_id = ${roomId} and guest_session_id = ${guestSessionId}`;
  return rows[0] ?? null;
}

const ADJECTIVES = ["Swift", "Brave", "Clever", "Sunny", "Cosmic", "Quiet", "Lucky", "Bold", "Witty", "Nimble", "Mellow", "Zesty"];
const ANIMALS = ["Otter", "Falcon", "Panda", "Lynx", "Koala", "Heron", "Fox", "Gecko", "Orca", "Badger", "Moth", "Yak"];
export function generateNickname(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]}`;
}

/** An agent ("build") room: always has an approved repository. */
export type BuildRoom = RoomRow & { mode: "build"; github_repository: string };

/** Agent/verification jobs only run for build rooms; anything else is a permanent job failure. */
export function requireBuildRoom(room: RoomRow): BuildRoom {
  if (room.mode !== "build" || !room.github_repository) {
    throw new PermanentJobError(`Room ${room.code} is a feedback-only session: no repository or coding agent`);
  }
  return room as BuildRoom;
}
