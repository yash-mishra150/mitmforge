import { useTraffic } from "./store";
import { groupByApp, buildDomainTree, pinnedRows } from "./selectors";
import { FileText, Globe, Star, Pin, Archive, Monitor, Search, LayoutDashboard, User } from "lucide-react";

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
      <div className="p-3">
        <Search className="h-5 w-5 mx-auto text-muted/50" aria-hidden="true" />
      </div>

      <Section title="Capture" icon={<Monitor className="h-3 w-3" />}>
        <NavItem label="Live Capture" view="log" onViewChange={onViewChange} icon={<FileText className="h-3 w-3" />} />
        <NavItem label="Overview" view="overview" onViewChange={onViewChange} icon={<LayoutDashboard className="h-3 w-3" />} />
        <NavItem label="Favorites" count={0} icon={<Star className="h-3 w-3" />} />
        <NavItem label="Pinned" count={pinnedData.length} icon={<Pin className="h-3 w-3" />} />
        <NavItem label="Saved" count={0} icon={<Archive className="h-3 w-3" />} />
        <NavItem label="All Requests" count={rows.length} icon={<Globe className="h-3 w-3" />} />
      </Section>

      <Section title="Apps" icon={<User className="h-3 w-3" />}>
        {appData.length === 0 ? (
          <Empty />
        ) : (
          appData.map((item) => (
            <Item
              key={item.client}
              label={item.client}
              count={item.count}
              icon={<Monitor className="h-3 w-3" />}
              onClick={() => setClientFilter(item.client)}
            />
          ))
        )}
      </Section>

      <Section title="Domains" icon={<Globe className="h-3 w-3" />}>
        {domainData.length === 0 ? (
          <Empty />
        ) : (
          domainData.map((item) => (
            <div key={item.host}>
              <Item label={item.host} count={item.count} icon={<Globe className="h-3 w-3" />} onClick={() => setHostFilter(item.host)} />
              <div className="ml-3 border-l border-line/50 pl-2">
                {item.paths.map((p) => (
                  <Item
                    key={p.path}
                    label={p.path}
                    count={p.count}
                    small
                    onClick={() => setHostFilter(item.host)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-3">
      <div className="flex items-center gap-2 px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-muted">
        {icon && <span className="text-muted/50">{icon}</span>}
        {title}
      </div>
      <div className="pb-2">{children}</div>
    </div>
  );
}

/** One clickable nav row with icon. */
function NavItem({
  label,
  view,
  count,
  icon,
  onViewChange,
}: {
  label: string;
  view?: "log" | "overview";
  count?: number;
  icon?: React.ReactNode;
  onViewChange?: (view: "log" | "overview") => void;
}) {
  const isActive = view && view === view;
  return (
    <div
      onClick={() => view && onViewChange && onViewChange(view)}
      className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all duration-150 ${isActive
        ? "bg-[color-mix(in_srgb,var(--mt-accent)_10%,transparent)] text-accent border-l-2 border-accent"
        : "text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] hover:text-fg"}`}
    >
      {icon && <span className="flex-shrink-0 text-muted/60 group-hover:text-fg transition-colors">{icon}</span>}
      <span className="truncate flex-1">{label}</span>
      {count !== undefined && <span className="text-muted/60 text-[10px] font-medium">{count}</span>}
    </div>
  );
}

/** One clickable sidebar entry with an optional count badge. */
function Item({
  label,
  count,
  small,
  icon,
  onClick,
}: {
  label: string;
  count?: number;
  small?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-2 px-2 rounded-md hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] transition-colors duration-150 ${small ? "py-0.5 text-xs text-muted" : "py-1.5 text-sm text-fg"}`}
    >
      {icon && <span className="flex-shrink-0 text-muted/50 group-hover:text-fg transition-colors">{icon}</span>}
      <span className="truncate flex-1">{label}</span>
      {count !== undefined && <span className="text-muted/60 text-[10px] font-medium">{count}</span>}
    </div>
  );
}

/** Empty-state placeholder. */
function Empty() {
  return <div className="px-3 py-2 text-xs text-muted/50 text-center">No data captured yet</div>;
}