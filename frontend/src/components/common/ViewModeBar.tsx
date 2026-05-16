export type ViewMode = "grid" | "list" | "table";

const VIEWS: { mode: ViewMode; label: string; icon: string }[] = [
  {
    mode: "grid",
    label: "Grid",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5"/>
      <rect x="13" y="13" width="8" height="8" rx="1.5"/>
    </svg>`,
  },
  {
    mode: "list",
    label: "List",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="3.5" cy="6" r="1.5"/>
      <circle cx="3.5" cy="12" r="1.5"/>
      <circle cx="3.5" cy="18" r="1.5"/>
    </svg>`,
  },
  {
    mode: "table",
    label: "Table",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="9" x2="9" y2="21"/>
    </svg>`,
  },
];

export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

interface Props {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  page: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

export default function ViewModeBar({
  mode,
  onModeChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center gap-3 mb-5">
      {/* View mode toggle */}
      <div
        role="group"
        aria-label="View mode"
        className="apple-toolbar flex items-center p-0.5 gap-0.5 shrink-0"
      >
        {VIEWS.map(({ mode: m, label, icon }) => (
          <button
            key={m}
            type="button"
            aria-label={label}
            aria-pressed={mode === m}
            title={label}
            onClick={() => { onModeChange(m); onPageChange(1); }}
            className={`p-1.5 rounded-md transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-default-400 hover:text-foreground hover:bg-default-100"
            }`}
            dangerouslySetInnerHTML={{ __html: icon }}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Count */}
      <span className="text-xs text-default-400 shrink-0">
        {total === 0 ? "0 items" : `${start}–${end} of ${total}`}
      </span>

      {/* Page size */}
      <select
        aria-label="Items per page"
        value={pageSize}
        onChange={(e) => {
          const val = Number(e.target.value) as PageSize;
          if (PAGE_SIZES.includes(val)) {
            onPageSizeChange(val);
            onPageChange(1);
          }
        }}
        className="h-8 rounded-lg apple-toolbar text-foreground text-xs px-2 pr-6 shrink-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>{s} / page</option>
        ))}
      </select>

      {/* Prev / Next */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="h-8 w-8 flex items-center justify-center rounded-md apple-toolbar text-default-400 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-shadow"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-xs text-default-400 px-1 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="h-8 w-8 flex items-center justify-center rounded-md apple-toolbar text-default-400 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-shadow"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
  );
}
