/**
 * Playwright global teardown — runs once after all tests complete.
 * Cleans up the projects and agent profile seeded by global-setup.
 */
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CIData } from "./global-setup";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:8000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "test-internal-api-key";
const CI_DATA_FILE = path.join(__dirname, "fixtures", "ci-data.json");

export default async function globalTeardown() {
  try {
    if (!fs.existsSync(CI_DATA_FILE)) return;

    const ciData: CIData = JSON.parse(fs.readFileSync(CI_DATA_FILE, "utf-8"));
    const api = axios.create({
      baseURL: SERVER_URL,
      headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
    });

    // Deleting projects cascades to their plans, tasks, and repos
    for (const id of [ciData.executingProjectId, ciData.planningProjectId, ciData.completedProjectId]) {
      await api.delete(`/projects/${id}`).catch((err) => {
        if (err?.response?.status !== 404)
          console.warn(`Teardown: failed to delete project ${id} (HTTP ${err?.response?.status}):`,
            err?.response?.data ?? err.message);
      });
    }
    await api.delete(`/agent-profiles/${ciData.agentProfileId}`).catch((err) => {
      if (err?.response?.status !== 404)
        console.warn(`Teardown: failed to delete agent profile ${ciData.agentProfileId} (HTTP ${err?.response?.status}):`,
          err?.response?.data ?? err.message);
    });
    for (const id of [ciData.promptProfileId, ciData.subAgentProfileId]) {
      await api.delete(`/agent-profiles/${id}`).catch((err) => {
        if (err?.response?.status !== 404)
          console.warn(`Teardown: failed to delete agent profile ${id} (HTTP ${err?.response?.status}):`,
            err?.response?.data ?? err.message);
      });
    }
  } catch (err) {
    console.warn("E2E teardown warning:", err);
  }
}
