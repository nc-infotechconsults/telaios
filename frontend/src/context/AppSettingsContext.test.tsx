import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  getSettings: vi.fn(),
  patchSettings: vi.fn(),
}));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { system_role: "admin" } }),
}));

import * as api from "../lib/api";
import { AppSettingsProvider, useAppSettings } from "./AppSettingsContext";
import { DEFAULT_APP_SETTINGS } from "../lib/appSettings";

function Probe() {
  const { settings, isAdmin } = useAppSettings();
  return (
    <div>
      <span data-testid="brand">{settings.brand_name}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
    </div>
  );
}

describe("AppSettingsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("fetches settings on mount and exposes them + isAdmin", async () => {
    (api.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_APP_SETTINGS,
      brand_name: "Acme",
    });
    render(
      <AppSettingsProvider>
        <Probe />
      </AppSettingsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("brand")).toHaveTextContent("Acme"));
    expect(screen.getByTestId("admin")).toHaveTextContent("true");
    expect(document.documentElement.style.getPropertyValue("--accent-1")).toBeTruthy();
  });
});
