import { describe, expect, it } from "vitest";
import { validateImageDataUrl } from "./image";

describe("validateImageDataUrl", () => {
  it("accepts a small image data url", () => {
    const url = "data:image/png;base64,AAAA";
    expect(validateImageDataUrl(url, 700_000)).toEqual({ ok: true });
  });

  it("rejects non-image data url", () => {
    expect(validateImageDataUrl("data:text/plain;base64,AAAA", 700_000).ok).toBe(false);
  });

  it("rejects oversize data url", () => {
    const url = `data:image/png;base64,${"a".repeat(800_000)}`;
    expect(validateImageDataUrl(url, 700_000).ok).toBe(false);
  });
});
