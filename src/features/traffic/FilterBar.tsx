import { X } from "lucide-react";

interface FilterBarProps {
  contentFilters: string[]; // active content type filters
  statusFilters: number[]; // active status filter categories (1,2,3,4,5)
  onContentFilterToggle: (type: string) => void;
  onStatusFilterToggle: (category: number) => void;
  onClear: () => void;
  activeCount: number;
}

const CONTENT_TYPES = [
  { value: "json", label: "JSON" },
  { value: "form", label: "Form" },
  { value: "xml", label: "XML" },
  { value: "js", label: "JS" },
  { value: "css", label: "CSS" },
  { value: "graphql", label: "GraphQL" },
  { value: "document", label: "Document" },
  { value: "media", label: "Media" },
  { value: "other", label: "Other" },
] as const;

export function FilterBar({
  contentFilters,
  statusFilters,
  onContentFilterToggle,
  onStatusFilterToggle,
  onClear,
  activeCount,
}: FilterBarProps) {
  return (
    <div className="flex h-9 flex-wrap items-center gap-2 border-b border-line bg-app px-3 text-xs">
      {/* Content type filters */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted">CONTENT</span>
        {CONTENT_TYPES.map(({ value, label }) => {
          const isActive = contentFilters.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onContentFilterToggle(value)}
              className={`rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-fg hover:border-[#2a2a2e] ${isActive
                ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent ring-1 ring-[color-mix(in_srgb,var(--mt-accent)_40%,transparent)]"
                : ""}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted">STATUS</span>
        {[1, 2, 3, 4, 5].map(cat => {
          const isActive = statusFilters.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onStatusFilterToggle(cat)}
              className={`rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-fg hover:border-[#2a2a2e] ${isActive
                ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent ring-1 ring-[color-mix(in_srgb,var(--mt-accent)_40%,transparent)]"
                : ""}`}
            >
              {cat}xx
            </button>
          );
        })}
      </div>

      {/* Clear button */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-2 flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-danger hover:border-[#2a2a2e]"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}