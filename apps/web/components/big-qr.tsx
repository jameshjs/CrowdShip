"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The join QR code as a button that opens it full screen, large enough to scan from the back of the room.
 * `qrSvg` is server-generated (our own QR renderer, no user input), so injecting it is safe.
 * Keyboard: Q toggles (when `hotkey`), Esc closes.
 */
export function QrButton({ qrSvg, joinUrl, code, className, hotkey }: { qrSvg: string; joinUrl: string; code: string; className?: string; hotkey?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (hotkey && (e.key === "q" || e.key === "Q") && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("group relative overflow-hidden rounded-xl bg-white p-1 transition-transform hover:scale-[1.03]", className)}
        aria-label={`Show the join QR code full screen (${joinUrl})`}
        title="Click to enlarge (Q)"
        data-testid="qr-button"
      >
        <span className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-md bg-black/70 text-white opacity-80 group-hover:opacity-100" aria-hidden>
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center text-[#120e24]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Join QR code"
            data-testid="qr-fullscreen"
          >
            <button className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-black/5 hover:bg-black/10" aria-label="Close" onClick={() => setOpen(false)}>
              <X className="h-6 w-6" />
            </button>
            <p className="text-3xl font-semibold">Scan to join</p>
            <motion.div
              className="aspect-square w-[min(72vh,86vw)] [&>svg]:h-full [&>svg]:w-full"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="font-mono text-2xl">{joinUrl.replace(/^https?:\/\//, "")}</p>
            <p className="text-xl">Room code <span className="font-mono text-5xl font-bold tracking-[0.2em]">{code}</span></p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
