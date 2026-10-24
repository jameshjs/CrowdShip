import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __crowdshipSql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    prepare: !url.includes("pooler.supabase.com:6543"),
    onnotice: () => {},
    transform: { undefined: null },
  });
}

/** Lazily-created shared connection pool (survives Next.js dev hot reloads). */
export function db(): postgres.Sql {
  globalThis.__crowdshipSql ??= create();
  return globalThis.__crowdshipSql;
}

export type Sql = postgres.Sql | postgres.TransactionSql;

export async function closeDb(): Promise<void> {
  await globalThis.__crowdshipSql?.end({ timeout: 5 });
  globalThis.__crowdshipSql = undefined;
}
