// ─── Vitest Global Setup ──────────────────────────────────────────────────────
//
// This file is loaded before every test file via vitest.config.ts `setupFiles`.
// It provides browser API mocks required by jsdom and our IDE stores.
// ──────────────────────────────────────────────────────────────────────────────

/// <reference types="vitest/globals" />

import "@testing-library/jest-dom/vitest";

// ── matchMedia mock ──────────────────────────────────────────────────────────
// jsdom does not implement matchMedia; many HeroUI / layout components call it.

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ── localStorage mock (jsdom provides one, but ensure it's clean) ────────────

beforeEach(() => {
  localStorage.clear();
});

// ── Suppress noisy console.warn / console.error from Zustand devtools ────────

const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const msg = String(args[0]);
    // Suppress known benign warnings
    if (msg.includes("[CommandRegistry]")) return;
    originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    const msg = String(args[0]);
    if (msg.includes("[CommandRegistry]")) return;
    if (msg.includes("[ContextKeyService]")) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
