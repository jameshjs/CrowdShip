import "server-only";

/** Origins allowed to call the widget endpoints with a bearer token (the demo app and its previews). */
function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const list = (process.env.WIDGET_ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim());
  for (const pattern of list) {
    if (pattern === origin) return origin;
    // Allow wildcard subdomains for preview deployments, e.g. https://*-team.vercel.app
    if (pattern.includes("*")) {
      const re: RegExp = new RegExp("^" + pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+") + "$");
      if (re.test(origin)) return origin;
    }
  }
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (!origin || !req.headers.get("authorization")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function preflight(req: Request): Promise<Response> {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}
