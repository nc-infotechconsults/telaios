/**
 * Template generator — produces infrastructure-as-code files (Dockerfile,
 * docker-compose.yml, k8s manifests, CI configs) from LLM output.
 */
import * as fs from "fs/promises";
import * as path from "path";

export interface InfraTemplate {
  path: string;
  content: string;
  /** Human-readable description of what this file does */
  description?: string;
}

export interface InfraTemplateRequest {
  /** Technology stack (e.g. "node", "python", "go", "rust") */
  stack: string;
  /** Target environment (e.g. "docker", "kubernetes", "docker-compose") */
  target: "docker" | "docker-compose" | "kubernetes" | "ci-github-actions" | "ci-gitlab" | "all";
  /** Application port (for Dockerfile EXPOSE + service ports) */
  port?: number;
  /** Extra context the LLM should know about (e.g. "uses PostgreSQL and Redis") */
  context?: string;
}

/**
 * Write generated template files to the workspace directory.
 * Returns the list of relative paths that were written.
 */
export async function writeTemplates(
  workspacePath: string,
  templates: InfraTemplate[],
): Promise<string[]> {
  const written: string[] = [];
  for (const tmpl of templates) {
    const absPath = path.join(workspacePath, tmpl.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, tmpl.content, "utf-8");
    written.push(tmpl.path);
  }
  return written;
}

/**
 * Detect the technology stack of a workspace from indicator files.
 */
export async function detectStack(workspacePath: string): Promise<string> {
  const checks: Array<[string, string]> = [
    ["package.json", "node"],
    ["requirements.txt", "python"],
    ["Pipfile", "python"],
    ["pyproject.toml", "python"],
    ["go.mod", "go"],
    ["Cargo.toml", "rust"],
    ["pom.xml", "java-maven"],
    ["build.gradle", "java-gradle"],
    ["Gemfile", "ruby"],
    ["composer.json", "php"],
  ];

  for (const [file, stack] of checks) {
    try {
      await fs.access(path.join(workspacePath, file));
      return stack;
    } catch { /* continue */ }
  }

  return "unknown";
}

/**
 * Build the system prompt for IaC generation based on the request.
 */
export function buildInfraPrompt(req: InfraTemplateRequest): string {
  const targets =
    req.target === "all"
      ? ["docker", "docker-compose", "kubernetes", "ci-github-actions"]
      : [req.target];

  const targetList = targets.join(", ");

  return `You are an expert DevOps engineer and infrastructure architect.

Generate production-ready infrastructure-as-code files for the following:
- Technology stack: ${req.stack}
- Target(s): ${targetList}
- Application port: ${req.port ?? 3000}
- Additional context: ${req.context ?? "standard web application"}

Requirements:
- Follow best practices for each target (multi-stage Dockerfile, resource limits in k8s, etc.)
- Include security best practices (non-root user in Docker, readiness probes in k8s, etc.)
- Add helpful comments explaining key configuration choices

Respond with a JSON array of files:
[
  {
    "path": "Dockerfile",
    "content": "# full file content",
    "description": "Multi-stage Dockerfile for production"
  },
  {
    "path": "docker-compose.yml",
    "content": "# full file content",
    "description": "Development docker-compose"
  }
]

Respond with ONLY valid JSON. No markdown fences.`;
}
