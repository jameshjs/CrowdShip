import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { forbidden, getParticipant, getRoomByCode, AppError, type ParticipantRow, type RoomRow } from "@crowdship/db";
import { env } from "./env";

const GUEST_COOKIE = "cs_guest";
const ORG_COOKIE = "cs_org";
const GUEST_TTL_DAYS = 30;

async function sign(claims: Record<string, unknown>, ttl: string, aud: string): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("crowdship")
    .setAudience(aud)
    .setExpirationTime(ttl)
    .sign(env.sessionSecret());
}

async function verify(token: string | undefined, aud: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret(), { issuer: "crowdship", audience: aud });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cookieOpts(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// ---------------------------------------------------------------- guests

/** The browser's guest session id, if it has a valid signed cookie. */
export async function readGuestSessionId(): Promise<string | null> {
  const claims = await verify((await cookies()).get(GUEST_COOKIE)?.value, "guest");
  return typeof claims?.sub === "string" ? claims.sub : null;
}

/** Return the existing guest session id or issue a new signed one. */
export async function ensureGuestSession(): Promise<string> {
  const existing = await readGuestSessionId();
  if (existing) return existing;
  const id = randomUUID();
  const token = await sign({ sub: id }, `${GUEST_TTL_DAYS}d`, "guest");
  (await cookies()).set(GUEST_COOKIE, token, cookieOpts(GUEST_TTL_DAYS * 86400));
  return id;
}

export interface ParticipantContext {
  room: RoomRow;
  participant: ParticipantRow;
}

/** Resolve the calling participant from the cookie (or a widget bearer token). Throws 401 if not joined. */
export async function requireParticipant(roomCode: string, req?: Request): Promise<ParticipantContext> {
  const room = await getRoomByCode(roomCode);
  const bearer = req?.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const claims = await verify(bearer, "widget");
    if (claims && claims.room === room.id && typeof claims.gsid === "string") {
      const participant = await getParticipant(room.id, claims.gsid);
      if (participant) return { room, participant };
    }
    throw new AppError(401, "unauthorized", "Widget session expired. Reopen the app from CrowdShip.");
  }
  const gsid = await readGuestSessionId();
  const participant = gsid ? await getParticipant(room.id, gsid) : null;
  if (!participant) throw new AppError(401, "not_joined", "Join the room first");
  return { room, participant };
}

/** Short-lived token the embedded widget uses from the demo app's origin. */
export async function mintWidgetToken(room: RoomRow, participant: ParticipantRow): Promise<string> {
  return sign({ room: room.id, gsid: participant.guest_session_id }, "12h", "widget");
}

// ---------------------------------------------------------------- organizer

function digest(s: string) {
  return createHash("sha256").update(s).digest();
}

export async function organizerLogin(password: string): Promise<boolean> {
  const ok = timingSafeEqual(digest(password), digest(env.organizerPassword()));
  if (!ok) return false;
  const token = await sign({ sub: "organizer", role: "organizer" }, "12h", "organizer");
  (await cookies()).set(ORG_COOKIE, token, cookieOpts(12 * 3600));
  return true;
}

export async function organizerLogout(): Promise<void> {
  (await cookies()).delete(ORG_COOKIE);
}

export async function currentOrganizer(): Promise<string | null> {
  const claims = await verify((await cookies()).get(ORG_COOKIE)?.value, "organizer");
  return claims?.role === "organizer" && typeof claims.sub === "string" ? claims.sub : null;
}

/** Server-side organizer authorization. The single seam to swap for Clerk later. */
export async function requireOrganizer(): Promise<string> {
  const id = await currentOrganizer();
  if (!id) throw new AppError(401, "organizer_required", "Organizer login required");
  return id;
}

export async function requireRoomOrganizer(roomCode: string): Promise<{ organizerId: string; room: RoomRow }> {
  const organizerId = await requireOrganizer();
  const room = await getRoomByCode(roomCode);
  if (room.organizer_id !== organizerId) throw forbidden();
  return { organizerId, room };
}

// ---------------------------------------------------------------- realtime

/** Room-scoped Supabase JWT for private Realtime channels. Participants may track presence; viewers may only listen. */
export async function mintRealtimeToken(roomCode: string, participantId: string | null): Promise<string> {
  return new SignJWT({
    role: "authenticated",
    room_code: roomCode,
    cs_role: participantId ? "participant" : "viewer",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(participantId ?? randomUUID())
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(env.supabaseJwtSecret());
}
