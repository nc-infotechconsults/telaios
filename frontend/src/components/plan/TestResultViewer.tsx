import { useState } from "react";
import { Chip } from "../ui";

interface TestRunResult {
  framework: string;
  passed: number;
  failed: number;
  output: string;
  success: boolean;
  durationMs: number;
}

interface TestSummary {
  passed: number;
  failed: number;
  durationMs: number;
  results: TestRunResult[];
  generatedFiles: string[];
}

interface Props {
  content: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Renders structured test results parsed from a JSON string produced by TestingAgent.
 */
export default function TestResultViewer({ content }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  let summary: TestSummary | null = null;
  try {
    summary = JSON.parse(content) as TestSummary;
  } catch {
    return (
      <pre className="text-xs text-default-500 bg-default-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
        {content}
      </pre>
    );
  }

  const total = summary.passed + summary.failed;
  const passRate = total > 0 ? Math.round((summary.passed / total) * 100) : 0;
  const allPassed = summary.failed === 0 && summary.results.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Chip size="sm" color={allPassed ? "success" : "danger"} variant="flat">
          {allPassed ? "All passed" : `${summary.failed} failed`}
        </Chip>
        <span className="text-xs text-default-500">
          {summary.passed} passed · {summary.failed} failed · {total} total
        </span>
        <span className="text-xs text-default-400">
          {formatDuration(summary.durationMs)}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-2 rounded-full bg-default-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${allPassed ? "bg-success" : "bg-danger"}`}
            style={{ width: `${passRate}%` }}
          />
        </div>
      )}

      {/* Per-framework results */}
      {summary.results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {summary.results.map((r, i) => (
            <div key={i} className="rounded-lg border border-default-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-default-50 transition-colors"
              >
                <Chip
                  size="sm"
                  color={r.success ? "success" : "danger"}
                  variant="flat"
                  className="shrink-0"
                >
                  {r.framework}
                </Chip>
                <span className="text-xs text-default-600 flex-1">
                  {r.passed} passed · {r.failed} failed
                </span>
                <span className="text-xs text-default-400 shrink-0">
                  {formatDuration(r.durationMs)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 text-default-300 transition-transform ${expandedIdx === i ? "rotate-90" : ""}`}
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {expandedIdx === i && (
                <div className="border-t border-default-100">
                  <pre className="text-xs text-default-500 bg-default-50 p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
                    {r.output || "(no output)"}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generated test files */}
      {summary.generatedFiles.length > 0 && (
        <div>
          <p className="text-[11px] text-default-400 uppercase tracking-wide mb-1.5">
            Generated test files
          </p>
          <ul className="flex flex-col gap-1">
            {summary.generatedFiles.map((f, i) => (
              <li key={i} className="text-xs font-mono text-default-600 bg-default-50 rounded px-2 py-1">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {summary.results.length === 0 && summary.generatedFiles.length === 0 && (
        <p className="text-xs text-default-400 italic">No test results available.</p>
      )}
    </div>
  );
}
