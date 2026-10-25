/** Landing-page form target: /join?code=abc12 → /join/ABC12 */
export function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  // Relative Location: behind a proxy (Render) req.url is the internal host (localhost:10000),
  // so an absolute URL built from it would send people to localhost.
  return new Response(null, { status: 303, headers: { Location: code ? `/join/${code}` : "/" } });
}
