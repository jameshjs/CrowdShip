import { contributedTo, getParticipant, getPublicRoomState, getRoomByCode, myVote, db } from "@crowdship/db";
import { route } from "@/lib/api";
import { readGuestSessionId } from "@/lib/auth";
import { roomCode, type RoomCtx } from "@/lib/room-params";

export const dynamic = "force-dynamic";

export const GET = route<RoomCtx>(async (_req, ctx) => {
  const code = await roomCode(ctx);
  const state = await getPublicRoomState(code);
  const gsid = await readGuestSessionId();
  let me = null;
  if (gsid) {
    const room = await getRoomByCode(code);
    const p = await getParticipant(room.id, gsid);
    if (p) {
      const winner = state.round?.winningProposalId;
      const [review] = winner
        ? await db()<{ rating: string }[]>`select rating from preview_reviews where proposal_id = ${winner} and participant_id = ${p.id}`
        : [];
      me = {
        participantId: p.id,
        nickname: p.nickname,
        vote: state.round ? await myVote(state.round.id, p.id) : null,
        previewRating: review?.rating ?? null,
        contributed: winner ? await contributedTo(winner, p.id) : false,
      };
    }
  }
  return Response.json({ ...state, me }, { headers: { "Cache-Control": "no-store" } });
});
