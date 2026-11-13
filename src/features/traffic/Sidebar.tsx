import { useTraffic } from "./store";
import { groupByApp, buildDomainTree, pinnedRows } from "./selectors";

/** Left nav: Capture / Overview / Favorites / Pinned / Saved / All / Apps / Domains. */
export function Sidebar({ onViewChange }: { onViewChange: (view: "log" | "overview") => void }) {
  const rows = useTraffic((s) => s.rows);
  const pinned = useTraffic((s) => s.pinned);
  const setHostFilter = useTraffic((s) => s.setHostFilter);
  const setClientFilter = useTraffic((s) => s.setClientFilter);

  const appData = groupByApp(rows);
  const domainData = buildDomainTree(rows);
  const pinnedData = pinnedRows(rows, pinned);

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-auto border-r border-line bg-surface">
      <div className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">Capture</div>
      <NavItem label="Capture" view="log" onViewChange={onViewChange} />
      <NavItem label="Overview" view="overview" onViewChange={onViewChange} />
      <NavItem label="Favorites" count={0} />
      <NavItem label="Pinned" count={pinnedData.length} />
      <NavItem label="Saved" count={0} />
      <NavItem label="All" count={rows.length} />

      <div className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">Apps</div>
      {appData.length === 0 ? (
        <Empty />
      ) : (
        appData.map((item) => (
          <Item key={item.client} label={item.client} count={item.count} onClick={() => setClientFilter(item.client)} />
        ))
      )}

      <div className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">Domains</div>
      {domainData.length === 0 ? (
        <Empty />
      ) : (
        domainData.map((item) => (
          <div key={item.host}>
            <Item label={item.host} count={item.count} onClick={() => setHostFilter(item.host)} />
            <div className="ml-3 border-l border-line pl-2">
              {item.paths.map((p) => (
                <Item key={p.path} label={p.path} count={p.count} small onClick={() => setHostFilter(item.host)} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** One clickable nav row. */
function NavItem({
  label,
  view,
  count,
  onViewChange,
}: {
  label: string;
  view?: "log" | "overview";
  count?: number;
  onViewChange?: (view: "log" | "overview") => void;
}) {
  const isActive = view && view === view;
  return (
    <div
      onClick={() => view && onViewChange && onViewChange(view)}
      className={`flex cursor-pointer items-center justify-between px-3 py-1.5 rounded-md text-xs ${isActive
        ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent"
        : "text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] hover:text-fg"}`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="text-muted">{count}</span>}
    </div>
  );
}

/** One clickable sidebar entry with an optional count badge. */
function Item({
  label,
  count,
  small,
  onClick,
}: {
  label: string;
  count?: number;
  small?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center justify-between px-3 rounded-md hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] ${small ? "py-0.5 text-xs text-muted" : "py-1 text-sm text-fg"}`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="text-muted">{count}</span>}
    </div>
  );
}

/** Empty-state placeholder. */
function Empty() {
  return <div className="px-3 py-1 text-xs text-muted opacity-60">—</div>;
}