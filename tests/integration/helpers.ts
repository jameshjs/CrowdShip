import { createRoom, joinRoom, startVoting, listProposals, type RoomRow } from "@crowdship/db";
import { randomUUID } from "node:crypto";

export async function makeRoom(overrides: Partial<Parameters<typeof createRoom>[0]> = {}): Promise<RoomRow> {
  return createRoom({
    organizerId: "test-organizer",
    projectName: "Test board",
    description: "",
    githubRepository: "example/demo",
    agentProvider: "mock",
    maxAcuPerSession: 5,
    loadDemoSeed: true,
    ...overrides,
  });
}

export async function makeParticipants(room: RoomRow, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((await joinRoom(room, randomUUID(), `P${i}`)).participant);
  return out;
}

export async function openVoting(room: RoomRow, seconds = 60) {
  const proposals = await listProposals(room.id);
  const ids = proposals.filter((p) => p.status === "approved").map((p) => p.id);
  const round = await startVoting(room, ids, seconds);
  return { round, proposalIds: ids };
}
