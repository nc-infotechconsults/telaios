/**
 * Test runner — detects the test framework for a workspace and executes tests,
 * capturing stdout/stderr and parsing pass/fail counts.
 */
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface TestFramework {
  name: string;
  command: string;
  /** Regex patterns to extract pass/fail counts from output */
  passPattern: RegExp;
  failPattern: RegExp;
}

const KNOWN_FRAMEWORKS: TestFramework[] = [
  {
    name: "vitest",
    command: "npx vitest run --reporter verbose 2>&1",
    passPattern: /(\d+)\s+passed/i,
    failPattern: /(\d+)\s+failed/i,
  },
  {
    name: "jest",
    command: "npx jest --no-coverage 2>&1",
    passPattern: /Tests:\s+.*?(\d+)\s+passed/i,
    failPattern: /Tests:\s+.*?(\d+)\s+failed/i,
  },
  {
    name: "mocha",
    command: "npx mocha 2>&1",
    passPattern: /(\d+)\s+passing/i,
    failPattern: /(\d+)\s+failing/i,
  },
  {
    name: "pytest",
    command: "python -m pytest -v 2>&1",
    passPattern: /(\d+)\s+passed/i,
    failPattern: /(\d+)\s+failed/i,
  },
  {
    name: "go-test",
    command: "go test ./... 2>&1",
    passPattern: /ok\s+/i,
    failPattern: /FAIL\s+/i,
  },
  {
    name: "cargo-test",
    command: "cargo test 2>&1",
    passPattern: /(\d+)\s+passed/i,
    failPattern: /(\d+)\s+failed/i,
  },
];

export interface TestRunResult {
  framework: string;
  passed: number;
  failed: number;
  output: string;
  success: boolean;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Detect which test framework a workspace uses by inspecting package.json,
 * Cargo.toml, go.mod, requirements.txt, etc.
 */
export async function detectFramework(workspacePath: string): Promise<TestFramework | null> {
  // Check package.json for JS/TS projects
  try {
    const pkgRaw = await fs.readFile(path.join(workspacePath, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    const allDeps = {
      ...pkg.devDependencies,
      ...pkg.dependencies,
    };

    if (allDeps.vitest || pkg.scripts?.test?.includes("vitest")) {
      return KNOWN_FRAMEWORKS.find((f) => f.name === "vitest") ?? null;
    }
    if (allDeps.jest || pkg.scripts?.test?.includes("jest")) {
      return KNOWN_FRAMEWORKS.find((f) => f.name === "jest") ?? null;
    }
    if (allDeps.mocha || pkg.scripts?.test?.includes("mocha")) {
      return KNOWN_FRAMEWORKS.find((f) => f.name === "mocha") ?? null;
    }
  } catch {
    // Not a JS/TS project
  }

  // Check for Python
  try {
    await fs.access(path.join(workspacePath, "pytest.ini"));
    return KNOWN_FRAMEWORKS.find((f) => f.name === "pytest") ?? null;
  } catch { /* continue */ }

  try {
    const req = await fs.readFile(path.join(workspacePath, "requirements.txt"), "utf-8");
    if (req.includes("pytest")) return KNOWN_FRAMEWORKS.find((f) => f.name === "pytest") ?? null;
  } catch { /* continue */ }

  // Check for Go
  try {
    await fs.access(path.join(workspacePath, "go.mod"));
    return KNOWN_FRAMEWORKS.find((f) => f.name === "go-test") ?? null;
  } catch { /* continue */ }

  // Check for Rust
  try {
    await fs.access(path.join(workspacePath, "Cargo.toml"));
    return KNOWN_FRAMEWORKS.find((f) => f.name === "cargo-test") ?? null;
  } catch { /* continue */ }

  return null;
}

/**
 * Run the detected test framework in the given workspace directory.
 * Returns a structured TestRunResult regardless of pass/fail.
 */
export async function runTests(
  workspacePath: string,
  framework: TestFramework,
  timeoutMs = 300_000, // 5 minute default
): Promise<TestRunResult> {
  const start = Date.now();

  let output = "";
  let exitCode = 0;

  try {
    const { stdout, stderr } = await execAsync(framework.command, {
      cwd: workspacePath,
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    output = stdout + stderr;
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number };
    output = (execErr.stdout ?? "") + (execErr.stderr ?? "");
    exitCode = execErr.code ?? 1;
  }

  const durationMs = Date.now() - start;

  const passMatch = framework.passPattern.exec(output);
  const failMatch = framework.failPattern.exec(output);

  const passed = passMatch ? parseInt(passMatch[1] ?? "0", 10) : (exitCode === 0 ? 1 : 0);
  const failed = failMatch ? parseInt(failMatch[1] ?? "0", 10) : (exitCode !== 0 ? 1 : 0);

  return {
    framework: framework.name,
    passed,
    failed,
    output: output.slice(0, 8000), // cap output for storage
    success: exitCode === 0 && failed === 0,
    durationMs,
  };
}
