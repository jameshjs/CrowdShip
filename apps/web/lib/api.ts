import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { AppError } from "@crowdship/db";
import { InvalidTransitionError } from "@crowdship/shared";
import { corsHeaders } from "./cors";

/**
 * Same-origin guard for cookie-authenticated mutations (CSRF defense on top of SameSite=Lax).
 * Requests carrying a widget bearer token are exempt because browsers never attach it automatically.
 */
export function assertSameOrigin(req: Request): void {
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new AppError(403, "bad_origin", "Missing origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError(403, "bad_origin", "Bad origin");
  }
  if (originHost !== host) throw new AppError(403, "bad_origin", "Cross-site request blocked");
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, "bad_json", "Invalid JSON body");
  }
  return schema.parse(body);
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "local";
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wrap a route handler: JSON responses, typed error mapping, no stack traces to clients. */
export function route<C>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await handler(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      // Widget requests are cross-origin: without CORS headers the browser hides the message ("Failed to fetch").
      const headers = corsHeaders(req);
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.code, message: err.message }, { status: err.status, headers });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return NextResponse.json(
          { error: "invalid", message: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input", issues: err.issues },
          { status: 400, headers },
        );
      }
      if (err instanceof InvalidTransitionError) {
        return NextResponse.json({ error: "invalid_transition", message: err.message }, { status: 409, headers });
      }
      console.error(JSON.stringify({ level: "error", msg: "unhandled route error", err: String(err), stack: (err as Error)?.stack }));
      return NextResponse.json({ error: "internal", message: "Something went wrong" }, { status: 500, headers });
    }
  };
}
