import { assertSameOrigin, route } from "@/lib/api";
import { organizerLogout } from "@/lib/auth";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await organizerLogout();
  return { ok: true };
});
