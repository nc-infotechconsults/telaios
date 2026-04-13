// ─── useMediaQuery ─────────────────────────────────────────────────────────────
//
// Low-level hook wrapping window.matchMedia with SSR safety.
// Returns true if the media query matches, false otherwise.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * @example
 * ```ts
 * const isWide = useMediaQuery("(min-width: 1024px)");
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Sync in case state is stale
    setMatches(mql.matches);

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
