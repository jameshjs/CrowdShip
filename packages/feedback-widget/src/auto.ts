import { mountFeedbackWidget } from "./index";

/**
 * Drop-in loader: <script src="https://<crowdship>/widget.js" data-app-version="1.0.0" defer></script>
 *
 * CrowdShip opens the app as  https://app/?cs_room=ABCDE&cs_api=https://crowdship#cs_token=...
 * The token is moved into sessionStorage and removed from the URL right away, so it
 * never ends up in history, referrers, or recorded page URLs.
 */
(function boot() {
  const KEY = "crowdship:widget";
  const script = document.currentScript as HTMLScriptElement | null;
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  let cfg: { room: string; api: string; token: string } | null = null;

  const room = url.searchParams.get("cs_room");
  const api = url.searchParams.get("cs_api");
  const token = hash.get("cs_token");
  if (room && api && token && /^[A-Z0-9]{4,8}$/.test(room) && /^https?:\/\//.test(api)) {
    cfg = { room, api: api.replace(/\/$/, ""), token };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {}
    url.searchParams.delete("cs_room");
    url.searchParams.delete("cs_api");
    hash.delete("cs_token");
    const h = hash.toString();
    history.replaceState(history.state, "", url.pathname + url.search + (h ? `#${h}` : ""));
  } else {
    try {
      cfg = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    } catch {}
  }
  if (!cfg) return; // not opened from CrowdShip: stay invisible

  const start = () => mountFeedbackWidget({ ...cfg!, appVersion: script?.dataset.appVersion });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
