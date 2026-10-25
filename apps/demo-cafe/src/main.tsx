import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// CrowdShip feedback widget: only activates when the app is opened from a CrowdShip room.
const crowdship = import.meta.env.VITE_CROWDSHIP_URL as string | undefined;
if (crowdship) {
  const s = document.createElement("script");
  s.src = `${crowdship.replace(/\/$/, "")}/widget.js`;
  s.defer = true;
  s.dataset.appVersion = __APP_VERSION__;
  document.head.appendChild(s);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
