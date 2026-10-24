import { NextResponse } from "next/server";

/** Landing-page form target: /join?code=abc12 → /join/ABC12 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return NextResponse.redirect(new URL(code ? `/join/${code}` : "/", url), 303);
}
