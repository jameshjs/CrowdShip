import { closeVoting, currentRound, getRoomById, rescheduleJob, type Job } from "@crowdship/db";

/** Close voting when ends_at passes. Late votes are already rejected by castVote's DB-clock check. */
export async function handleRoundTimer(job: Job<{ roomId: string; roundId: string }>): Promise<"done" | "rescheduled"> {
  const room = await getRoomById(job.payload.roomId);
  const res = await closeVoting(room, { onlyIfExpired: true, roundId: job.payload.roundId });
  if (res) return "done";
  const round = await currentRound(room.id);
  if (round?.id === job.payload.roundId && round.status === "voting" && round.ends_at && round.ends_at.getTime() > Date.now() - 5000) {
    await rescheduleJob(job.id, Math.max(500, round.ends_at.getTime() - Date.now() + 200));
    return "rescheduled";
  }
  return "done";
}
