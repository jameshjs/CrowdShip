/** What we record about a selected element. Never form values or page contents. */
export interface ElementInfo {
  identifier: string;
  label: string;
}

const MAX = 120;

function clip(s: string) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t;
}

/** Find the most stable identifier for an element: data-testid on it or an ancestor, then id, then a short CSS path. */
export function describeElement(el: Element): ElementInfo {
  const withTestId = el.closest("[data-testid]");
  let identifier: string;
  if (withTestId) identifier = `testid:${withTestId.getAttribute("data-testid")}`;
  else if (el.id) identifier = `#${el.id}`;
  else identifier = cssPath(el);

  const target = (withTestId as HTMLElement | null) ?? (el as HTMLElement);
  // Never read the value of inputs; use their accessible name instead.
  const isField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  const aria = target.getAttribute("aria-label") || target.getAttribute("title") || target.getAttribute("placeholder");
  const text = isField ? "" : target.textContent ?? "";
  const role = target.getAttribute("role") || target.tagName.toLowerCase();
  const label = clip(aria || text || role);
  return { identifier: clip(identifier), label: isField ? `${label} (${role} field)` : label };
}

function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && parts.length < 4 && cur !== document.body) {
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    const same = [...parent.children].filter((c) => c.tagName === cur!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
    cur = parent;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}
