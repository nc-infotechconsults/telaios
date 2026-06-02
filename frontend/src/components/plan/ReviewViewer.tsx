import { Chip } from "../ui";

type Severity = "error" | "warning" | "suggestion" | "praise";

interface ReviewComment {
  file: string;
  line?: number;
  severity: Severity;
  message: string;
}

interface ReviewResult {
  approved: boolean;
  summary: string;
  comments: ReviewComment[];
}

interface Props {
  content: string;
}

const SEVERITY_COLOR: Record<Severity, "danger" | "warning" | "primary" | "success"> = {
  error: "danger",
  warning: "warning",
  suggestion: "primary",
  praise: "success",
};

const SEVERITY_ICON: Record<Severity, string> = {
  error: "fa-xmark",
  warning: "fa-triangle-exclamation",
  suggestion: "fa-comment",
  praise: "fa-check",
};

/**
 * Renders a code-review result produced by ReviewAgent.
 * Content is a JSON string matching the ReviewResult interface.
 */
export default function ReviewViewer({ content }: Props) {
  let review: ReviewResult | null = null;
  try {
    review = JSON.parse(content) as ReviewResult;
  } catch {
    return (
      <pre className="text-xs text-default-500 bg-default-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
        {content}
      </pre>
    );
  }

  const errorCount = review.comments.filter((c) => c.severity === "error").length;
  const warningCount = review.comments.filter((c) => c.severity === "warning").length;
  const suggestionCount = review.comments.filter((c) => c.severity === "suggestion").length;
  const praiseCount = review.comments.filter((c) => c.severity === "praise").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Approval badge + summary */}
      <div className="flex items-start gap-3">
        <Chip
          size="sm"
          color={review.approved ? "success" : "danger"}
          variant="flat"
          className="shrink-0 mt-0.5"
        >
          {review.approved ? "Approved" : "Changes requested"}
        </Chip>
        <p className="text-sm text-default-600 leading-relaxed">{review.summary}</p>
      </div>

      {/* Severity totals */}
      {review.comments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {errorCount > 0 && (
            <Chip size="sm" color="danger" variant="bordered">
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </Chip>
          )}
          {warningCount > 0 && (
            <Chip size="sm" color="warning" variant="bordered">
              {warningCount} warning{warningCount !== 1 ? "s" : ""}
            </Chip>
          )}
          {suggestionCount > 0 && (
            <Chip size="sm" color="primary" variant="bordered">
              {suggestionCount} suggestion{suggestionCount !== 1 ? "s" : ""}
            </Chip>
          )}
          {praiseCount > 0 && (
            <Chip size="sm" color="success" variant="bordered">
              {praiseCount} praise{praiseCount !== 1 ? "s" : ""}
            </Chip>
          )}
        </div>
      )}

      {/* Comment cards — errors first, then warnings, suggestions, praise */}
      {review.comments.length > 0 && (
        <div className="flex flex-col gap-2">
          {[...review.comments]
            .sort((a, b) => {
              const order: Record<Severity, number> = { error: 0, warning: 1, suggestion: 2, praise: 3 };
              return order[a.severity] - order[b.severity];
            })
            .map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-default-200 px-3 py-2.5 flex gap-2.5"
              >
                {/* Severity icon */}
                <i
                  className={`fa-solid ${SEVERITY_ICON[c.severity]} shrink-0 mt-0.5 text-sm text-${SEVERITY_COLOR[c.severity]}`}
                  aria-label={c.severity}
                />

                <div className="flex flex-col gap-1 min-w-0">
                  {/* File + line */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-[11px] text-default-500 bg-default-100 rounded px-1.5 py-0.5 truncate max-w-[280px]">
                      {c.file}
                      {c.line != null ? `:${c.line}` : ""}
                    </code>
                    <Chip size="sm" color={SEVERITY_COLOR[c.severity]} variant="flat">
                      {c.severity}
                    </Chip>
                  </div>

                  {/* Message */}
                  <p className="text-xs text-default-700 leading-relaxed">{c.message}</p>
                </div>
              </div>
            ))}
        </div>
      )}

      {review.comments.length === 0 && (
        <p className="text-xs text-default-400 italic">No comments.</p>
      )}
    </div>
  );
}
