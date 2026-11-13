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
    <div className="mb-2 flex h-8 flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-1 text-xs">
      {/* Content type filters */}
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-500">Content:</span>
        {CONTENT_TYPES.map(({ value, label }) => {
          const isActive = contentFilters.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onContentFilterToggle(value)}
              className={`rounded-full px-2 py-0.5 transition-colors ${isActive
                ? "bg-emerald-900/80 text-emerald-200 ring-1 ring-emerald-400/50"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-1.5">
        <span className="text-neutral-500">Status:</span>
        {[1, 2, 3, 4, 5].map(cat => {
          const isActive = statusFilters.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onStatusFilterToggle(cat)}
              className={`rounded-full px-2 py-0.5 transition-colors ${isActive
                ? "bg-emerald-900/80 text-emerald-200 ring-1 ring-emerald-400/50"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
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
          className="ml-2 flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 hover:bg-neutral-700"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}