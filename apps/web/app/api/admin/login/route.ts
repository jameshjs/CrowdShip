import { z } from "zod";
import { AppError, audit, rateLimit } from "@crowdship/db";
import { assertSameOrigin, clientIp, parseJson, route } from "@/lib/api";
import { organizerLogin } from "@/lib/auth";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await rateLimit(`login:${clientIp(req)}`, 10, 300);
  const { password } = await parseJson(req, z.object({ password: z.string().min(1).max(200) }));
  if (!(await organizerLogin(password))) {
    await audit(null, `ip:${clientIp(req)}`, "organizer_login_failed");
    throw new AppError(401, "bad_password", "Wrong password");
  }
  await audit(null, "organizer", "organizer_login");
  return { ok: true };
});
