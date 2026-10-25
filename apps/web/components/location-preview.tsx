"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { PublicProposal } from "@crowdship/shared";
import { cn } from "@/lib/utils";

type Location = NonNullable<PublicProposal["location"]>;

/**
 * Where an idea applies. With a region on an app we can frame, render the real page scaled down
 * and scrolled to the spot, with the area outlined. Otherwise a page map, or the text location.
 * Only the `live` (top) card loads a frame, so a deck stays light.
 */
export function LocationPreview({ location, appUrl, live, height = 168, className }: { location: Location | null; appUrl: string | null; live?: boolean; height?: number; className?: string }) {
  if (!location) return null;
  const { region } = location;
  if (region && appUrl && live) return <FramePreview location={location} region={region} appUrl={appUrl} height={height} className={className} />;
  if (region) return <PageMap location={location} region={region} className={className} />;
  if (location.label) {
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-fg-muted", className)} data-testid="location-label">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /> <span className="truncate">{location.label}</span>
      </p>
    );
  }
  return null;
}

function FramePreview({ location, region, appUrl, height: H, className }: { location: Location; region: NonNullable<Location["region"]>; appUrl: string; height: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width ? width / region.pageW : 0;
  const pageH = Math.min(region.pageH, 4000);
  const centerY = (region.y + region.h / 2) * scale;
  const offset = Math.max(0, Math.min(centerY - H / 2, pageH * scale - H));
  const src = frameSrc(appUrl, location.pageUrl);
  const d = `M${region.points.map(([x, y]) => `${x},${y}`).join(" L")} Z`;

  return (
    <div ref={box} className={cn("relative overflow-hidden rounded-xl border border-line bg-white", className)} style={{ height: H }} data-testid="location-frame">
      {scale > 0 && (
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: region.pageW, height: pageH, transform: `translateY(${-offset}px) scale(${scale})` }}>
          <iframe src={src} title="Where this idea applies" tabIndex={-1} loading="lazy" sandbox="allow-scripts allow-same-origin" className="h-full w-full border-0" />
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${region.pageW} ${pageH}`} aria-hidden>
            <path d={d} fill="oklch(0.72 0.16 290 / 0.18)" stroke="oklch(0.65 0.2 290)" strokeWidth={3 / scale} strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {location.label && (
        <span className="absolute bottom-2 left-2 right-2 truncate rounded-lg bg-bg/85 px-2 py-1 text-[11px] text-fg backdrop-blur">
          📍 {location.label.replace(/^(Circled area|On the site): /, "")}
        </span>
      )}
    </div>
  );
}

function PageMap({ location, region, className }: { location: Location; region: NonNullable<Location["region"]>; className?: string }) {
  const viewH = Math.min(region.pageH, Math.max(region.h * 3, region.pageW * 0.9));
  const top = Math.max(0, Math.min(region.pageH - viewH, region.y + region.h / 2 - viewH / 2));
  const d = `M${region.points.map(([x, y]) => `${x},${y}`).join(" L")} Z`;
  return (
    <div className={cn("flex items-center gap-3", className)} data-testid="location-map">
      <svg viewBox={`0 ${top} ${region.pageW} ${viewH}`} className="h-14 w-20 shrink-0 rounded-md border border-line bg-bg-sunken" aria-hidden>
        <path d={d} fill="oklch(0.72 0.16 290 / 0.3)" stroke="oklch(0.78 0.15 290)" strokeWidth={Math.max(2, region.pageW / 80)} strokeLinejoin="round" />
      </svg>
      {location.label && <p className="line-clamp-2 text-xs text-fg-muted">📍 {location.label.replace(/^(Circled area|On the site): /, "")}</p>}
    </div>
  );
}

/** The app's page as a plain URL: no CrowdShip parameters or token, so the widget stays hidden in previews. */
function frameSrc(appUrl: string, pageUrl: string | null): string {
  try {
    const u = new URL(appUrl);
    if (pageUrl && pageUrl.startsWith("/")) u.pathname = pageUrl;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return appUrl;
  }
}
