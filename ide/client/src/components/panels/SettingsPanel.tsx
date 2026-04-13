// ─── Settings Panel ────────────────────────────────────────────────────────────
//
// Auto-rendered settings UI. Reads SettingContribution from all active plugins
// and renders a form grouped by category with immediate persistence.
//
// Field types:
//   string  → text input
//   number  → number input
//   boolean → toggle switch
//   enum    → dropdown select
//   object  → JSON textarea (advanced)
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useCallback } from "react";
import { useSettingsStore, type RegisteredSetting } from "@/stores/settingsStore";
import { Settings, ChevronRight, Search } from "lucide-react";

// ─── Component ───────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const contributions = useSettingsStore((s) => s.contributions);
  const values = useSettingsStore((s) => s.values);
  const setValue = useSettingsStore((s) => s.setValue);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Group contributions by category, filtering by search query
  const grouped = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? contributions.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.key.toLowerCase().includes(q) ||
            (c.description ?? "").toLowerCase().includes(q) ||
            (c.category ?? "").toLowerCase().includes(q),
        )
      : contributions;

    const groups = new Map<string, RegisteredSetting[]>();
    for (const c of filtered) {
      const cat = c.category ?? "General";
      const arr = groups.get(cat);
      if (arr) {
        arr.push(c);
      } else {
        groups.set(cat, [c]);
      }
    }
    return groups;
  }, [contributions, searchQuery]);

  // Auto-expand all categories when searching
  const effectiveExpanded = useMemo(() => {
    if (searchQuery.trim()) {
      return new Set(grouped.keys());
    }
    return expandedCategories;
  }, [searchQuery, grouped, expandedCategories]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  if (contributions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-3 p-6">
        <Settings size={32} className="text-zinc-600" />
        <p>No settings available</p>
        <p className="text-xs text-zinc-600 text-center">
          Settings appear when plugins register setting contributions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
        <Search size={14} className="text-zinc-500 shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings..."
          className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
          spellCheck={false}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-zinc-600 hover:text-zinc-400 text-[10px]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto">
        {grouped.size === 0 && searchQuery.trim() && (
          <div className="px-4 py-8 text-center text-zinc-600 text-xs">
            No settings match &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {Array.from(grouped.entries()).map(([category, settings]) => {
          const isExpanded = effectiveExpanded.has(category);

          return (
            <div key={category} className="border-b border-white/[0.04]">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.03] transition-colors"
              >
                <ChevronRight
                  size={12}
                  className={`text-zinc-500 transition-transform duration-150 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <span className="font-medium">{category}</span>
                <span className="text-zinc-600 text-[10px] ml-auto">
                  {settings.length}
                </span>
              </button>

              {/* Settings fields */}
              {isExpanded && (
                <div className="px-3 pb-2">
                  {settings.map((setting) => (
                    <SettingField
                      key={setting.key}
                      setting={setting}
                      value={values[setting.key] ?? setting.default}
                      onChange={(v) => setValue(setting.key, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Individual Setting Field ────────────────────────────────────────────────

function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: RegisteredSetting;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="py-2 px-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-zinc-200 font-medium block">
            {setting.label}
          </label>
          {setting.description && (
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">
              {setting.description}
            </p>
          )}
          <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
            {setting.key}
          </p>
        </div>

        <div className="shrink-0 mt-0.5">
          <SettingInput
            setting={setting}
            value={value}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Setting Input Renderers ─────────────────────────────────────────────────

function SettingInput({
  setting,
  value,
  onChange,
}: {
  setting: RegisteredSetting;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (setting.type) {
    case "boolean":
      return <BooleanInput value={!!value} onChange={onChange} />;
    case "string":
      return (
        <StringInput value={String(value ?? "")} onChange={onChange} />
      );
    case "number":
      return (
        <NumberInput value={Number(value ?? 0)} onChange={onChange} />
      );
    case "enum":
      return (
        <EnumInput
          value={String(value ?? "")}
          options={setting.enum ?? []}
          labels={setting.enumLabels}
          onChange={onChange}
        />
      );
    case "object":
      return <ObjectInput value={value} onChange={onChange} />;
    default:
      return (
        <span className="text-[10px] text-zinc-600">
          Unsupported type: {setting.type}
        </span>
      );
  }
}

// ── Boolean Toggle ───────────────────────────────────────────────────────────

function BooleanInput({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={[
        "relative w-8 h-[18px] rounded-full transition-colors duration-200",
        value
          ? "bg-violet-500/60"
          : "bg-zinc-700",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
          value ? "translate-x-[15px]" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ── String Input ─────────────────────────────────────────────────────────────

function StringInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-40 px-2 py-1 text-xs bg-black/30 border border-white/[0.08] rounded text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
    />
  );
}

// ── Number Input ─────────────────────────────────────────────────────────────

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      className="w-24 px-2 py-1 text-xs bg-black/30 border border-white/[0.08] rounded text-zinc-200 outline-none focus:border-violet-500/50 transition-colors"
    />
  );
}

// ── Enum Select ──────────────────────────────────────────────────────────────

function EnumInput({
  value,
  options,
  labels,
  onChange,
}: {
  value: string;
  options: string[];
  labels?: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-40 px-2 py-1 text-xs bg-black/30 border border-white/[0.08] rounded text-zinc-200 outline-none focus:border-violet-500/50 transition-colors appearance-none cursor-pointer"
    >
      {options.map((opt, i) => (
        <option key={opt} value={opt}>
          {labels?.[i] ?? opt}
        </option>
      ))}
    </select>
  );
}

// ── Object (JSON) Input ──────────────────────────────────────────────────────

function ObjectInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "{}";
    }
  });
  const [error, setError] = useState<string | null>(null);

  const handleBlur = useCallback(() => {
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }, [text, onChange]);

  return (
    <div className="w-48">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={3}
        className={[
          "w-full px-2 py-1 text-[10px] font-mono bg-black/30 border rounded text-zinc-200 outline-none resize-y transition-colors",
          error
            ? "border-red-500/50"
            : "border-white/[0.08] focus:border-violet-500/50",
        ].join(" ")}
        spellCheck={false}
      />
      {error && (
        <p className="text-[9px] text-red-400 mt-0.5">{error}</p>
      )}
    </div>
  );
}
