type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 1;

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < MIN) return;
  const line = JSON.stringify({ level, msg, ...fields, at: new Date().toISOString(), svc: "worker" });
  (level === "error" ? console.error : console.log)(line);
}
