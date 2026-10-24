export function deviceCategory(): "mobile" | "tablet" | "desktop" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

/** Coarse browser family + major version only. */
export function browserName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const m =
    ua.match(/(Edg|OPR|SamsungBrowser|Firefox|FxiOS|CriOS|Chrome)\/(\d+)/) ??
    (/Safari/.test(ua) ? ua.match(/Version\/(\d+)/)?.length ? ["", "Safari", ua.match(/Version\/(\d+)/)![1]] : null : null);
  return m ? `${m[1]} ${m[2]}` : "other";
}
