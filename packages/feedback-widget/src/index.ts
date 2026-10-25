import { describeElement, type ElementInfo } from "./element";

export interface WidgetOptions {
  /** CrowdShip origin, e.g. https://crowdship.example.com */
  api: string;
  room: string;
  /** Short-lived widget token issued by CrowdShip for this participant. */
  token: string;
  appVersion?: string;
}

type Mode = "closed" | "menu" | "selecting" | "circling" | "form";
type Kind = "bug" | "feature" | "general";

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.fab { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 2147483646; width: 56px; height: 56px;
  border-radius: 18px; border: 0; background: linear-gradient(120deg, #dca4ef, #9b8cf5 45%, #7cb8f8); color: #fff; font-size: 24px;
  box-shadow: 0 10px 34px -6px rgba(124, 92, 240, .7); cursor: pointer; }
.sheet { position: fixed; left: 12px; right: 12px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 2147483646; max-width: 380px; margin-left: auto;
  background: rgba(30, 24, 56, .92); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); color: #f3f1fb; border: 1px solid rgba(150, 130, 230, .35);
  border-radius: 18px; padding: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.title { font-size: 13px; color: #b6add6; margin: 2px 4px 10px; }
.menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 14px 12px; margin-bottom: 6px; border-radius: 12px; border: 1px solid rgba(150, 130, 230, .28);
  background: rgba(20, 15, 40, .6); color: #f3f1fb; font-size: 15px; text-align: left; cursor: pointer; }
.menu button:hover { border-color: rgba(170, 150, 250, .6); }
textarea { width: 100%; min-height: 88px; resize: none; border-radius: 12px; border: 1px solid rgba(150, 130, 230, .3); background: rgba(14, 10, 30, .7); color: #f3f1fb; padding: 10px; font-size: 16px; }
textarea:focus { outline: none; border-color: #9b8cf5; }
.row { display: flex; gap: 8px; margin-top: 10px; }
.primary { flex: 1; height: 46px; border: 0; border-radius: 12px; background: linear-gradient(120deg, #dca4ef, #9b8cf5 45%, #7cb8f8); color: #fff; font-weight: 600; font-size: 15px; cursor: pointer; }
.primary:disabled { opacity: .5; }
.ghost { height: 46px; padding: 0 14px; border-radius: 12px; border: 1px solid rgba(150, 130, 230, .3); background: transparent; color: #b6add6; cursor: pointer; }
.chip { display: inline-block; font-size: 12px; color: #c9b8ff; background: rgba(155, 140, 245, .16); border-radius: 999px; padding: 3px 10px; margin-bottom: 8px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msg { font-size: 13px; margin-top: 8px; }
.ok { color: #5fd6a4; } .err { color: #f8818f; }
.bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: calc(10px + env(safe-area-inset-top)) 14px 10px; background: rgba(30, 24, 56, .95); color: #f3f1fb; font-size: 14px; border-bottom: 1px solid rgba(150, 130, 230, .35); }
.bar button { height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(150, 130, 230, .35); background: rgba(20, 15, 40, .7); color: #f3f1fb; cursor: pointer; }
.hl { position: fixed; z-index: 2147483645; pointer-events: none; border: 2px solid #9b8cf5; background: rgba(155, 140, 245, .14); border-radius: 6px; transition: all .06s; }
.draw { position: fixed; inset: 0; z-index: 2147483645; touch-action: none; cursor: crosshair; background: rgba(12, 8, 28, .18); }
.draw svg { width: 100%; height: 100%; display: block; }
.draw path { fill: rgba(155, 140, 245, .16); stroke: #b49cff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 6px rgba(155, 140, 245, .8)); }
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
  let region: Region | null = null;
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

    if (mode === "circling") {
      const draw = el("div", "draw");
      draw.setAttribute("data-testid", "crowdship-draw");
      const svg = document.createElementNS(SVG_NS, "svg");
      const path = document.createElementNS(SVG_NS, "path");
      svg.append(path);
      draw.append(svg);
      attachDrawing(draw, path);
      const bar = el("div", "bar");
      bar.append(el("span", "", "Circle the part of the screen you mean"));
      const cancel = el("button", "", "Cancel");
      cancel.setAttribute("data-testid", "crowdship-cancel-circle");
      cancel.onclick = () => {
        mode = "menu";
        render();
      };
      bar.append(cancel);
      root.append(draw, bar);
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
        ["⭕", "Circle an area", () => {
          mode = "circling";
          element = null;
          region = null;
          render();
        }],
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
      sheet.append(el("p", "title", region ? "What about this area?" : kind === "bug" ? "What went wrong?" : "What would make this better?"));
      if (element) sheet.append(el("span", "chip", `${region ? "⭕" : "🎯"} ${element.label}`));
      const ta = document.createElement("textarea");
      ta.maxLength = 1000;
      ta.placeholder = region ? "e.g. This part is hard to read" : kind === "bug" ? "e.g. The counter is wrong after I uncheck a task" : "Describe your idea";
      ta.setAttribute("data-testid", "crowdship-text");
      sheet.append(ta);
      const row = el("div", "row");
      const back = el("button", "ghost", "Back");
      back.onclick = () => {
        mode = "menu";
        element = null;
        region = null;
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

  // ---------------------------------------------------------------- circle an area
  // The overlay only exists while circling; it blocks page interaction and scrolling (touch-action: none).
  const attachDrawing = (draw: HTMLElement, path: SVGPathElement) => {
    let pts: [number, number][] = [];
    draw.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      draw.setPointerCapture(e.pointerId);
      pts = [[e.clientX, e.clientY]];
    });
    draw.addEventListener("pointermove", (e) => {
      if (!pts.length) return;
      const last = pts[pts.length - 1]!;
      if (Math.hypot(e.clientX - last[0], e.clientY - last[1]) < 3) return;
      pts.push([e.clientX, e.clientY]);
      path.setAttribute("d", `M${pts.map((p) => p.join(",")).join(" L")}`);
    });
    const finish = () => {
      if (!pts.length) return;
      const drawn = pts;
      pts = [];
      const done = finishCircle(drawn);
      if (!done) path.setAttribute("d", ""); // too small: let them try again
    };
    draw.addEventListener("pointerup", finish);
    draw.addEventListener("pointercancel", () => {
      pts = [];
      path.setAttribute("d", "");
    });
  };

  const finishCircle = (viewportPts: [number, number][]): boolean => {
    const xs = viewportPts.map((p) => p[0]);
    const ys = viewportPts.map((p) => p[1]);
    const box = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    if (viewportPts.length < 3 || box.right - box.left < 16 || box.bottom - box.top < 16) return false;

    // What's inside: sample a grid under the overlay (which is hidden from elementsFromPoint by filtering the host).
    const found = new Map<string, ElementInfo>();
    for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 4; j++) {
        const x = box.left + ((box.right - box.left) * i) / 5;
        const y = box.top + ((box.bottom - box.top) * j) / 5;
        const target = pickContent(x, y);
        if (!target) continue;
        const info = describeElement(target);
        if (!found.has(info.identifier)) found.set(info.identifier, info);
      }
    }
    const infos = [...found.values()].slice(0, 5);
    element = infos.length
      ? { identifier: clip(`area: ${infos.map((i) => i.identifier).join(", ")}`, 200), label: clip(`Circled area: ${infos.map((i) => i.label).join(", ")}`, 200) }
      : { identifier: "area", label: "Circled area" };

    const sx = window.scrollX;
    const sy = window.scrollY;
    const step = Math.max(1, Math.ceil(viewportPts.length / 64));
    const points = viewportPts.filter((_, i) => i % step === 0).slice(0, 64).map(([x, y]) => [Math.round(x + sx), Math.round(y + sy)] as [number, number]);
    if (points.length < 3) return false;
    region = {
      x: Math.round(box.left + sx),
      y: Math.round(box.top + sy),
      w: Math.round(box.right - box.left),
      h: Math.round(box.bottom - box.top),
      pageW: Math.max(1, document.documentElement.scrollWidth),
      pageH: Math.max(1, document.documentElement.scrollHeight),
      points,
    };
    kind = "general";
    mode = "form";
    render();
    return true;
  };

  /** Topmost page element at a point, skipping the widget and structural wrappers. */
  const pickContent = (x: number, y: number): Element | null => {
    const els = document.elementsFromPoint(x, y).filter((n) => n !== host && !host.contains(n));
    return els.find((n) => n !== document.body && n !== document.documentElement) ?? null;
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
          region: region ?? undefined,
          applicationVersion: opts.appVersion,
          deviceCategory: /Mobi|Android|iPhone/i.test(ua) ? "mobile" : /iPad|Tablet/i.test(ua) ? "tablet" : "desktop",
          browser: (ua.match(/(Edg|Firefox|CriOS|Chrome|Version)\/(\d+)/) ?? [, "other", ""]).slice(1).join(" ").replace("Version", "Safari"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? `Failed (${res.status})`);
      status = { ok: true, text: "Thanks! Sent to CrowdShip." };
      element = null;
      region = null;
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

const SVG_NS = "http://www.w3.org/2000/svg";

/** A circled area in page pixels; mirrors feedbackRegion in @crowdship/shared. */
interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  pageW: number;
  pageH: number;
  points: [number, number][];
}

function clip(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function el(tag: string, cls = "", text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // always text, never HTML
  return n;
}

export { describeElement };
export type { ElementInfo };
