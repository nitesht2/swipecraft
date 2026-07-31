"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once the page is interactive.
 *
 * Deliberately production-only. In `next dev` the chunk filenames change on
 * every edit, and a service worker sitting in front of them serves stale
 * modules and produces confusing "module not found" errors. To exercise the
 * worker locally, run a production build instead:
 *
 *     bun run build && bun start --port 3334
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Non-fatal: the app works fine without offline support.
        console.warn("Service worker registration failed:", err);
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
