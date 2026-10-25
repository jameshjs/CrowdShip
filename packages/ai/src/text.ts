// Deterministic text utilities for the non-LLM triage fallback.

const STOPWORDS = new Set(
  "a an the and or but if then so to of in on for with at by from as is are was were be been being it its this that these those i me my we our you your they them their he she can could would should will just please need want wish like add make have has had do does did not no yes app thing things way some more much very really also there here what when where which who how".split(" "),
);

/** Map surface words to canonical concepts so "night", "white background" and "dark mode" meet. */
const SYNONYMS: Record<string, string> = {
  dark: "darkmode", night: "darkmode", theme: "darkmode", black: "darkmode", bright: "darkmode", white: "darkmode", eyes: "darkmode", background: "darkmode", darkmode: "darkmode",
  sort: "sort", sorting: "sort", reorder: "sort", alphabetical: "sort", arrange: "sort", newest: "sort", oldest: "sort",
  progress: "progress", percent: "progress", percentage: "progress", bar: "progress", completion: "progress", done: "progress",
  category: "category", categories: "category", tag: "category", tags: "category", label: "category", labels: "category", group: "category", filter: "category", color: "category",
  shortcut: "shortcut", shortcuts: "shortcut", keyboard: "shortcut", hotkey: "shortcut", hotkeys: "shortcut", key: "shortcut", keys: "shortcut",
  delete: "delete", remove: "delete", trash: "delete",
  edit: "edit", rename: "edit",
  due: "duedate", deadline: "duedate", date: "duedate", reminder: "duedate",
  counter: "counter", count: "counter", counts: "counter", number: "counter", total: "counter",
  // Café demo vocabulary.
  vegan: "diet", vegetarian: "diet", gluten: "diet", dairy: "diet", lactose: "diet", allergy: "diet", allergies: "diet", allergen: "diet", dietary: "diet", diet: "diet",
  search: "search", find: "search", lookup: "search", searching: "search",
  favorite: "favorite", favourite: "favorite", favorites: "favorite", favourites: "favorite", usual: "favorite", star: "favorite",
  note: "notes", notes: "notes", instructions: "notes", barista: "notes", special: "notes",
  cart: "cart", basket: "cart", checkout: "cart",
  broken: "bug", bug: "bug", crash: "bug", wrong: "bug", error: "bug", fails: "bug", doesnt: "bug", work: "bug", working: "bug",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/dark[\s-]+mode/g, "darkmode")
    .replace(/n't\b/g, "nt")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? stem(w));
}

/** Concepts are the canonical synonym targets present in the text (excluding the generic "bug" marker). */
export function concepts(text: string): Set<string> {
  const vals = new Set(Object.values(SYNONYMS));
  return new Set(tokens(text).filter((t) => vals.has(t) && t !== "bug"));
}

/** Similarity in [0, 1]: weighted mix of shared-concept overlap and token Jaccard. */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = inter / (ta.size + tb.size - inter);
  const ca = concepts(a);
  const cb = concepts(b);
  const sharedConcepts = [...ca].filter((c) => cb.has(c)).length;
  const conceptScore = ca.size && cb.size ? (2 * sharedConcepts) / (ca.size + cb.size) : 0;
  return Math.min(1, 0.65 * conceptScore + 0.35 * jaccard + (sharedConcepts > 0 && jaccard > 0.3 ? 0.1 : 0));
}

/** A stable key for a cluster, used to match future feedback without an LLM. */
export function clusterKey(text: string): string {
  const c = [...concepts(text)].sort();
  if (c.length) return `c:${c.join("+")}`;
  return `t:${[...new Set(tokens(text))].sort().slice(0, 6).join("+")}`;
}
