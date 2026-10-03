"use client";

import { useEffect } from "react";
import { REALTIME_URL } from "./socket";

/** Comfortably inside the ~15-minute idle window of free hosting tiers (e.g. Render Free). */
const INTERVAL_MS = 4 * 60_000;

/**
 * While a host screen is open, ping the game server's /health endpoint so free hosting
 * tiers that sleep on HTTP inactivity don't spin it down mid-event (which would end the
 * game, since live rooms are held in memory). Runs in background tabs too — a projector
 * page is often not the focused window. Failures are ignored: this is insurance only.
 */
export function useKeepServerAwake() {
  useEffect(() => {
    const ping = () => {
      void fetch(`${REALTIME_URL.replace(/\/$/, "")}/health`, { cache: "no-store" }).catch(
        () => {},
      );
    };
    ping();
    const timer = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
