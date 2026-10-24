// Intentionally small blocklist. This is a first-pass filter for a projected screen,
// not a content-safety system; anything matched is held for organizer review.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard", "whore", "slut", "dick", "cock", "pussy",
];
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function deobfuscate(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z\s]/g, "");
}

export type ModerationVerdict = { ok: true } | { ok: false; reason: "profanity" | "link" };

export function moderate(text: string): ModerationVerdict {
  if (URL_RE.test(text)) return { ok: false, reason: "link" };
  const cleaned = deobfuscate(text);
  const words = cleaned.split(/\s+/);
  const squashed = cleaned.replace(/\s+/g, "");
  for (const bad of BLOCKED) {
    if (words.includes(bad) || words.some((w) => w.startsWith(bad) && w.length <= bad.length + 3)) {
      return { ok: false, reason: "profanity" };
    }
    if (bad.length >= 5 && squashed.includes(bad)) return { ok: false, reason: "profanity" };
  }
  return { ok: true };
}

/** Strip control characters and collapse whitespace. Rendering is always plain text. */
export function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}
