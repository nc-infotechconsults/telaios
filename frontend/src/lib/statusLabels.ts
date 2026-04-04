/** Formats a raw status string (e.g. "in_progress") into a human-readable label. */
export function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
