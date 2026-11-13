interface FilterBarProps {
  activeTabs: string[];
  allTabs: ReadonlyArray<string>;
  onContentTabToggle: (type: string) => void;
}

const TAB_LABELS: Record<string, string> = {
  All: "All",
  json: "JSON",
  form: "Form",
  xml: "XML",
  js: "JS",
  css: "CSS",
  graphql: "GraphQL",
  document: "Document",
  media: "Media",
  other: "Other",
  "http": "HTTP",
  "https": "HTTPS",
  "websocket": "WebSocket",
  ">": ">"
};

/** Top filter tab row: content-type filters sit above the traffic table. */
export function FilterBar({
  activeTabs,
  allTabs,
  onContentTabToggle,
}: FilterBarProps) {
  return (
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-line bg-app px-3 scrollbar-hidden">
      {allTabs.map((tab) => {
        const isActive = activeTabs.includes(tab);
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onContentTabToggle(tab)}
            className={`whitespace-nowrap rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-fg hover:border-[#2a2a2e] ${isActive
              ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent ring-1 ring-[color-mix(in_srgb,var(--mt-accent)_40%,transparent)]"
              : ""}`}
          >
            {TAB_LABELS[tab] ?? tab}
          </button>
        );
      })}
    </div>
  );
}