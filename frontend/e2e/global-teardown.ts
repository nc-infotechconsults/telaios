/**
 * Playwright global teardown — runs once after all tests complete.
 * Cleans up the projects and agent profile seeded by global-setup.
 */
import axios from "axios";
import fs from "fs";
import path from "path";
import type { CIData } from "./global-setup";

const DATA_API = process.env.DATA_API_URL ?? "http://localhost:3000";
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? "test-internal-api-key";
const CI_DATA_FILE = path.join(__dirname, "fixtures", "ci-data.json");

export default async function globalTeardown() {
  try {
    if (!fs.existsSync(CI_DATA_FILE)) return;

    const ciData: CIData = JSON.parse(fs.readFileSync(CI_DATA_FILE, "utf-8"));
    const api = axios.create({
      baseURL: DATA_API,
      headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
    });

    // Deleting projects cascades to their plans, tasks, and repos
    for (const id of [ciData.executingProjectId, ciData.planningProjectId, ciData.completedProjectId]) {
      await api.delete(`/projects/${id}`).catch(() => {});
    }
    await api.delete(`/agent-profiles/${ciData.agentProfileId}`).catch(() => {});
  } catch (err) {
    console.warn("E2E teardown warning:", err);
  }
}
