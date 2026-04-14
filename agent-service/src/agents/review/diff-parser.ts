/**
 * Diff parser — converts raw `git diff` output into a structured representation
 * that the ReviewAgent can pass to the LLM as clean, focused context.
 */

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string; // raw hunk text including the @@ header
}

export interface FileDiff {
  path: string;
  oldPath: string | null; // non-null only for renames
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[];
  /** Flat text of all hunks — easier for LLM consumption */
  rawDiff: string;
}

export interface ParsedDiff {
  files: FileDiff[];
  /** Total lines added across all files */
  totalAdded: number;
  /** Total lines removed across all files */
  totalRemoved: number;
}

const FILE_HEADER_RE = /^diff --git a\/(.*?) b\/(.*)$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse the output of `git diff` (or `git diff HEAD~1`) into structured FileDiffs.
 */
export function parseDiff(rawDiff: string): ParsedDiff {
  const lines = rawDiff.split("\n");
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let totalAdded = 0;
  let totalRemoved = 0;

  const pushHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk);
      current.rawDiff += currentHunk.content + "\n";
    }
  };

  for (const line of lines) {
    const fileMatch = FILE_HEADER_RE.exec(line);
    if (fileMatch) {
      pushHunk();
      currentHunk = null;
      if (current) files.push(current);
      current = {
        path: fileMatch[2],
        oldPath: fileMatch[1] !== fileMatch[2] ? fileMatch[1] : null,
        status: "modified",
        hunks: [],
        rawDiff: "",
      };
      continue;
    }

    if (!current) continue;

    // Detect file status from git diff headers
    if (line.startsWith("new file mode")) { current.status = "added"; continue; }
    if (line.startsWith("deleted file mode")) { current.status = "deleted"; continue; }
    if (line.startsWith("rename from")) { current.status = "renamed"; continue; }

    const hunkMatch = HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      pushHunk();
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: parseInt(hunkMatch[2] ?? "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newLines: parseInt(hunkMatch[4] ?? "1", 10),
        content: line + "\n",
      };
      continue;
    }

    if (currentHunk) {
      currentHunk.content += line + "\n";
      if (line.startsWith("+") && !line.startsWith("+++")) totalAdded++;
      if (line.startsWith("-") && !line.startsWith("---")) totalRemoved++;
    }
  }

  pushHunk();
  if (current) files.push(current);

  return { files, totalAdded, totalRemoved };
}

/**
 * Format a ParsedDiff into a compact LLM-friendly string, optionally
 * truncating very large diffs to stay within token budgets.
 */
export function formatDiffForLLM(diff: ParsedDiff, maxCharsPerFile = 4000): string {
  const parts: string[] = [
    `Changed files: ${diff.files.length} | +${diff.totalAdded} -${diff.totalRemoved}\n`,
  ];

  for (const file of diff.files) {
    const header = `\n--- ${file.status.toUpperCase()}: ${file.path} ---\n`;
    const body = file.rawDiff.length > maxCharsPerFile
      ? file.rawDiff.slice(0, maxCharsPerFile) + "\n... (truncated)"
      : file.rawDiff;
    parts.push(header + body);
  }

  return parts.join("");
}
