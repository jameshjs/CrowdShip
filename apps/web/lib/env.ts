import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const env = {
  sessionSecret: () => new TextEncoder().encode(required("SESSION_SECRET")),
  organizerPassword: () => required("ORGANIZER_PASSWORD"),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseJwtSecret: () => new TextEncoder().encode(required("SUPABASE_JWT_SECRET")),
  publicUrl: () => process.env.PUBLIC_URL ?? "http://localhost:3000",
  secureCookies: () => process.env.NODE_ENV === "production",
};
