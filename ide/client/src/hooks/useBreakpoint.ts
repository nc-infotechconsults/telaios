// ─── useBreakpoint ─────────────────────────────────────────────────────────────
//
// High-level responsive hook for the AgentScope IDE.
// Returns the current breakpoint name and convenience booleans.
//
// Breakpoints (mobile-first, matching Tailwind defaults):
//   phone:   < 640px  (sm)
//   tablet:  640–1023px
//   desktop: 1024–1279px
//   wide:    ≥ 1280px
//
// Usage:
//   const { isPhone, isTablet, isDesktop, breakpoint } = useBreakpoint();
//   if (isPhone) return <MobileShell />;
// ──────────────────────────────────────────────────────────────────────────────

import { useMediaQuery } from "./useMediaQuery";

/** Named breakpoints for the IDE layout system. */
export type Breakpoint = "phone" | "tablet" | "desktop" | "wide";

export interface BreakpointResult {
  /** Current breakpoint name */
  breakpoint: Breakpoint;
  /** True if viewport < 640px */
  isPhone: boolean;
  /** True if viewport 640–1023px */
  isTablet: boolean;
  /** True if viewport 1024–1279px */
  isDesktop: boolean;
  /** True if viewport ≥ 1280px */
  isWide: boolean;
  /** True for phone + tablet (< 1024px) — hides sidebars, shows mobile nav */
  isMobile: boolean;
}

/**
 * Determine the current responsive breakpoint.
 *
 * Uses `matchMedia` listeners — zero layout thrash, updates on resize.
 *
 * @example
 * ```tsx
 * function IDEShell() {
 *   const { isMobile, isPhone } = useBreakpoint();
 *   if (isMobile) return <MobileShell />;
 *   return <DesktopShell />;
 * }
 * ```
 */
export function useBreakpoint(): BreakpointResult {
  const isSm = useMediaQuery("(min-width: 640px)");
  const isLg = useMediaQuery("(min-width: 1024px)");
  const isXl = useMediaQuery("(min-width: 1280px)");

  let breakpoint: Breakpoint;
  if (isXl) breakpoint = "wide";
  else if (isLg) breakpoint = "desktop";
  else if (isSm) breakpoint = "tablet";
  else breakpoint = "phone";

  return {
    breakpoint,
    isPhone: !isSm,
    isTablet: isSm && !isLg,
    isDesktop: isLg && !isXl,
    isWide: isXl,
    isMobile: !isLg,
  };
}
