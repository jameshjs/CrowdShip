import { describeElement, type ElementInfo } from "./element";

export interface WidgetOptions {
  /** CrowdShip origin, e.g. https://crowdship.example.com */
  api: string;
  room: string;
  /** Short-lived widget token issued by CrowdShip for this participant. */
  token: string;
  appVersion?: string;
}

type Mode = "closed" | "menu" | "selecting" | "form";
type Kind = "bug" | "feature";

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.fab { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483646; width: 56px; height: 56px;
  border-radius: 18px; border: 0; background: #34d399; color: #062c1f; font-size: 24px; box-shadow: 0 8px 30px rgba(0,0,0,.35); cursor: pointer; }
.sheet { position: fixed; left: 12px; right: 12px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 2147483646; max-width: 380px; margin-left: auto;
  background: #1b1e2b; color: #eef0f6; border: 1px solid #343a4f; border-radius: 18px; padding: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.title { font-size: 13px; color: #9aa2b8; margin: 2px 4px 10px; }
.menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 14px 12px; margin-bottom: 6px; border-radius: 12px; border: 1px solid #343a4f;
  background: #141722; color: #eef0f6; font-size: 15px; text-align: left; cursor: pointer; }
.menu button:hover { border-color: #4b5370; }
textarea { width: 100%; min-height: 88px; resize: none; border-radius: 12px; border: 1px solid #343a4f; background: #10131c; color: #eef0f6; padding: 10px; font-size: 16px; }
textarea:focus { outline: none; border-color: #34d399; }
.row { display: flex; gap: 8px; margin-top: 10px; }
.primary { flex: 1; height: 46px; border: 0; border-radius: 12px; background: #34d399; color: #062c1f; font-weight: 600; font-size: 15px; cursor: pointer; }
.primary:disabled { opacity: .5; }
.ghost { height: 46px; padding: 0 14px; border-radius: 12px; border: 1px solid #343a4f; background: transparent; color: #9aa2b8; cursor: pointer; }
.chip { display: inline-block; font-size: 12px; color: #34d399; background: rgba(52,211,153,.12); border-radius: 999px; padding: 3px 10px; margin-bottom: 8px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msg { font-size: 13px; margin-top: 8px; }
.ok { color: #34d399; } .err { color: #f87171; }
.bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 14px 10px; background: #1b1e2b; color: #eef0f6; font-size: 14px; border-bottom: 1px solid #343a4f; }
.bar button { height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid #343a4f; background: #141722; color: #eef0f6; cursor: pointer; }
.hl { position: fixed; z-index: 2147483645; pointer-events: none; border: 2px solid #34d399; background: rgba(52,211,153,.12); border-radius: 6px; transition: all .06s; }
`;

/** Mount the CrowdShip feedback widget. Returns an unmount function. */
export function mountFeedbackWidget(opts: WidgetOptions): () => void {
  const host = document.createElement("div");
  host.setAttribute("data-crowdship-widget", "");
  const root = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  let mode: Mode = "closed";
  let kind: Kind = "feature";
  let element: ElementInfo | null = null;
  let status: { ok: boolean; text: string } | null = null;
  let busy = false;
  let hl: HTMLDivElement | null = null;

  const render = () => {
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    if (mode === "selecting") {
      const bar = el("div", "bar");
      bar.append(el("span", "", "Tap the part of the app you want to comment on"));
      const cancel = el("button", "", "Cancel");
      cancel.setAttribute("data-testid", "crowdship-cancel-select");
      cancel.onclick = () => stopSelecting();
      bar.append(cancel);
      root.append(bar);
      hl = el("div", "hl") as HTMLDivElement;
      hl.style.display = "none";
      root.append(hl);
      return;
    }

    const fab = el("button", "fab", mode === "closed" ? "💬" : "✕");
    fab.setAttribute("aria-label", mode === "closed" ? "Give feedback" : "Close feedback");
    fab.setAttribute("data-testid", "crowdship-fab");
    fab.onclick = () => {
      mode = mode === "closed" ? "menu" : "closed";
      status = null;
      render();
    };
    root.append(fab);

    if (mode === "menu") {
      const sheet = el("div", "sheet menu");
      sheet.append(el("p", "title", "CrowdShip feedback"));
      const items: [string, string, () => void][] = [
        ["🐞", "Report a bug", () => openForm("bug")],
        ["💡", "Suggest an improvement", () => openForm("feature")],
        ["🎯", "Select an element", () => startSelecting()],
      ];
      for (const [icon, label, fn] of items) {
        const b = el("button", "", `${icon}  ${label}`);
        b.setAttribute("data-testid", `crowdship-${label.split(" ")[0]!.toLowerCase()}`);
        b.onclick = fn;
        sheet.append(b);
      }
      root.append(sheet);
    }

    if (mode === "form") {
      const sheet = el("div", "sheet");
      sheet.append(el("p", "title", kind === "bug" ? "What went wrong?" : "What would make this better?"));
      if (element) sheet.append(el("span", "chip", `🎯 ${element.label}`));
      const ta = document.createElement("textarea");
      ta.maxLength = 1000;
      ta.placeholder = kind === "bug" ? "e.g. The counter is wrong after I uncheck a task" : "Describe your idea";
      ta.setAttribute("data-testid", "crowdship-text");
      sheet.append(ta);
      const row = el("div", "row");
      const back = el("button", "ghost", "Back");
      back.onclick = () => {
        mode = "menu";
        element = null;
        render();
      };
      const send = el("button", "primary", busy ? "Sending…" : "Send") as HTMLButtonElement;
      send.setAttribute("data-testid", "crowdship-send");
      send.disabled = busy;
      send.onclick = () => void submit(ta.value);
      row.append(back, send);
      sheet.append(row);
      if (status) sheet.append(el("p", `msg ${status.ok ? "ok" : "err"}`, status.text));
      root.append(sheet);
      setTimeout(() => ta.focus(), 30);
    }
  };

  const openForm = (k: Kind) => {
    kind = k;
    mode = "form";
    status = null;
    render();
  };

  // ---------------------------------------------------------------- element selection
  // Listeners are only attached while selecting, so normal use of the app is untouched.
  const onMove = (e: PointerEvent) => {
    const target = pick(e.clientX, e.clientY);
    if (!target || !hl) return;
    const r = target.getBoundingClientRect();
    Object.assign(hl.style, { display: "block", left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
  };
  const swallow = (e: Event) => {
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onPick = (e: MouseEvent) => {
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    const target = pick(e.clientX, e.clientY);
    if (!target) return;
    element = describeElement(target);
    detachSelect();
    kind = "bug";
    mode = "form";
    render();
  };
  const pick = (x: number, y: number): Element | null => {
    const els = document.elementsFromPoint(x, y);
    return els.find((n) => n !== host && !host.contains(n)) ?? null;
  };
  const detachSelect = () => {
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("click", onPick, true);
    document.removeEventListener("pointerdown", swallow, true);
    document.removeEventListener("submit", swallow, true);
  };
  const startSelecting = () => {
    mode = "selecting";
    render();
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerdown", swallow, true);
    document.addEventListener("click", onPick, true);
    document.addEventListener("submit", swallow, true);
  };
  const stopSelecting = () => {
    detachSelect();
    mode = "menu";
    render();
  };

  // ---------------------------------------------------------------- submit
  const submit = async (text: string) => {
    busy = true;
    status = null;
    render();
    try {
      const ua = navigator.userAgent;
      const res = await fetch(`${opts.api}/api/rooms/${encodeURIComponent(opts.room)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
        body: JSON.stringify({
          type: kind,
          text: text.trim(),
          pageUrl: location.pathname, // path only: no query string or fragment
          elementIdentifier: element?.identifier,
          elementLabel: element?.label,
          applicationVersion: opts.appVersion,
          deviceCategory: /Mobi|Android|iPhone/i.test(ua) ? "mobile" : /iPad|Tablet/i.test(ua) ? "tablet" : "desktop",
          browser: (ua.match(/(Edg|Firefox|CriOS|Chrome|Version)\/(\d+)/) ?? [, "other", ""]).slice(1).join(" ").replace("Version", "Safari"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? `Failed (${res.status})`);
      status = { ok: true, text: "Thanks! Sent to CrowdShip." };
      element = null;
      busy = false;
      render();
      setTimeout(() => {
        mode = "closed";
        status = null;
        render();
      }, 1600);
    } catch (e) {
      busy = false;
      status = { ok: false, text: e instanceof Error ? e.message : "Could not send" };
      render();
    }
  };

  render();
  return () => {
    detachSelect();
    host.remove();
  };
}

function el(tag: string, cls = "", text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // always text, never HTML
  return n;
}

export { describeElement };
export type { ElementInfo };
