/**
 * Helm client module.
 *
 * Wraps the `helm` CLI (assumed to be installed in the container) via
 * child_process.exec for install/upgrade/uninstall/status operations.
 *
 * Also provides chart scanning across cloned project repositories.
 */
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { promisify } from "util";
import { AppDataSource } from "../configs/data-source.config";
import { Repository } from "../entities/Repository.entity";
import { HelmRelease } from "../entities/HelmRelease.entity";

const execFileAsync = promisify(execFile);
const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT ?? "/workspaces";

async function helm(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("helm", args);
  return stdout.trim();
}

/** Write values to a temp YAML file and return args and a cleanup callback. */
async function valuesArgs(values: Record<string, unknown>): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  const tmpPath = path.join(os.tmpdir(), `helm-values-${randomUUID()}.yaml`);
  // Serialize as JSON (helm accepts JSON in --values files)
  await fs.writeFile(tmpPath, JSON.stringify(values), "utf-8");
  return {
    args: ["--values", tmpPath],
    cleanup: () => fs.unlink(tmpPath).catch(() => undefined),
  };
}

export interface HelmChart {
  name: string;
  version: string;
  description: string;
  repoUrl?: string;
  localPath?: string;
}

export const HelmService = {
  /** List charts available in a remote Helm repository */
  async listCharts(repoUrl: string): Promise<HelmChart[]> {
    try {
      const name = `tmp-repo-${Date.now()}`;
      await helm("repo", "add", name, repoUrl);
      await helm("repo", "update");
      const raw = await helm("search", "repo", `${name}/`, "--output", "json");
      await helm("repo", "remove", name).catch(() => undefined);
      const parsed = JSON.parse(raw) as Array<{ name: string; chart_version: string; description: string }>;
      return parsed.map((c) => ({
        name: c.name.replace(`${name}/`, ""),
        version: c.chart_version,
        description: c.description,
        repoUrl,
      }));
    } catch {
      return [];
    }
  },

  /** Scan project repositories for Chart.yaml files (local Helm charts) */
  async scanProjectForCharts(projectId: string): Promise<HelmChart[]> {
    const repoRepo = AppDataSource.getRepository(Repository);
    const repos = await repoRepo.find({ where: { project_id: projectId } });
    const charts: HelmChart[] = [];

    for (const repo of repos) {
      const basePath = path.join(WORKSPACES_ROOT, projectId, repo.name);
      try {
        await walkForCharts(basePath, basePath, charts, repo.name);
      } catch {
        // repo not cloned yet — skip
      }
    }

    return charts;
  },

  async install(
    releaseName: string,
    chart: string,
    namespace: string,
    values?: Record<string, unknown>,
    repoUrl?: string,
    chartVersion?: string,
  ): Promise<string> {
    const isOci = repoUrl?.startsWith("oci://");
    const chartArg = isOci ? `${repoUrl}/${chart}` : chart;
    const args = ["install", releaseName, chartArg, "--namespace", namespace, "--create-namespace", "--output", "json"];
    if (repoUrl && !isOci) {
      args.push("--repo", repoUrl);
    }
    if (chartVersion) {
      args.push("--version", chartVersion);
    }
    if (values && Object.keys(values).length > 0) {
      const { args: vArgs, cleanup } = await valuesArgs(values);
      args.push(...vArgs);
      try {
        return await helm(...args);
      } finally {
        await cleanup();
      }
    }
    return helm(...args);
  },

  async upgrade(
    releaseName: string,
    chart: string,
    namespace: string,
    values?: Record<string, unknown>,
    repoUrl?: string,
    chartVersion?: string,
  ): Promise<string> {
    const isOci = repoUrl?.startsWith("oci://");
    const chartArg = isOci ? `${repoUrl}/${chart}` : chart;
    const args = ["upgrade", releaseName, chartArg, "--namespace", namespace, "--install", "--output", "json"];
    if (repoUrl && !isOci) {
      args.push("--repo", repoUrl);
    }
    if (chartVersion) {
      args.push("--version", chartVersion);
    }
    if (values && Object.keys(values).length > 0) {
      const { args: vArgs, cleanup } = await valuesArgs(values);
      args.push(...vArgs);
      try {
        return await helm(...args);
      } finally {
        await cleanup();
      }
    }
    return helm(...args);
  },

  async uninstall(releaseName: string, namespace: string): Promise<string> {
    return helm("uninstall", releaseName, "--namespace", namespace);
  },

  async status(releaseName: string, namespace: string): Promise<unknown> {
    const raw = await helm("status", releaseName, "--namespace", namespace, "--output", "json");
    return JSON.parse(raw);
  },

  async listReleases(namespace = "all"): Promise<unknown[]> {
    const args = ["list", "--output", "json"];
    if (namespace !== "all") {
      args.push("--namespace", namespace);
    } else {
      args.push("--all-namespaces");
    }
    try {
      const raw = await helm(...args);
      return JSON.parse(raw) as unknown[];
    } catch {
      return [];
    }
  },

  async getHelmReleaseDb(environmentId: string): Promise<HelmRelease[]> {
    const releaseRepo = AppDataSource.getRepository(HelmRelease);
    return releaseRepo.find({ where: { environment_id: environmentId }, order: { created_at: "DESC" } });
  },
};

async function walkForCharts(
  basePath: string,
  currentPath: string,
  charts: HelmChart[],
  repoName: string,
  depth = 0,
): Promise<void> {
  if (depth > 4) return;
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    if (entry.isFile() && entry.name === "Chart.yaml") {
      const chartYaml = await fs.readFile(path.join(currentPath, "Chart.yaml"), "utf-8");
      const nameMatch = chartYaml.match(/^name:\s*(.+)$/m);
      const versionMatch = chartYaml.match(/^version:\s*(.+)$/m);
      const descMatch = chartYaml.match(/^description:\s*(.+)$/m);
      charts.push({
        name: nameMatch?.[1]?.trim() ?? entry.name,
        version: versionMatch?.[1]?.trim() ?? "0.1.0",
        description: descMatch?.[1]?.trim() ?? "",
        localPath: path.relative(basePath, currentPath),
      });
    } else if (entry.isDirectory()) {
      await walkForCharts(basePath, path.join(currentPath, entry.name), charts, repoName, depth + 1);
    }
  }
}
