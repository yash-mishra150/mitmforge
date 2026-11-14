import { useState } from "react";
import { useTraffic } from "./store";
import { groupByApp, buildDomainTree, pinnedRows } from "./selectors";
import { FileText, Globe, Star, Pin, Archive, Monitor, Search, LayoutDashboard, User, ChevronRight, X } from "lucide-react";

/** Left nav: Capture / Overview / Favorites / Pinned / Saved / All / Apps / Domains. */
export function Sidebar({ onViewChange }: { onViewChange: (view: "log" | "overview") => void }) {
  const rows = useTraffic((s) => s.rows);
  const pinned = useTraffic((s) => s.pinned);
  const setHostFilter = useTraffic((s) => s.setHostFilter);
  const setClientFilter = useTraffic((s) => s.setClientFilter);
  const clientFilter = useTraffic((s) => s.clientFilter);
  const hostFilter = useTraffic((s) => s.hostFilter);
  const sidebarView = useTraffic((s) => s.sidebarView);
  const setSidebarView = useTraffic((s) => s.setSidebarView);
  const clearFilters = () => {
    setHostFilter(null);
    setClientFilter(null);
    setSidebarView(null);
  };

  const appData = groupByApp(rows);
  const domainData = buildDomainTree(rows);
  const pinnedData = pinnedRows(rows, pinned);

  const [captureExpanded, setCaptureExpanded] = useState(true);
  const [appsExpanded, setAppsExpanded] = useState(true);
  const [domainsExpanded, setDomainsExpanded] = useState(true);

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-auto border-r border-line bg-surface">
      <div className="p-3 border-b border-line/50">
        <Search className="h-5 w-5 mx-auto text-muted/50" aria-hidden="true" />
      </div>

      <Section
        title="Capture"
        icon={<Monitor className="h-3 w-3" />}
        expanded={captureExpanded}
        onToggle={() => setCaptureExpanded(!captureExpanded)}
      >
        <NavItem
          label="Live Capture"
          count={rows.length}
          view="log"
          onViewChange={onViewChange}
          icon={<FileText className="h-3 w-3" />}
          isActive={!clientFilter && !hostFilter}
          onClick={clearFilters}
        />
        <NavItem
          label="Overview"
          view="overview"
          onViewChange={onViewChange}
          icon={<LayoutDashboard className="h-3 w-3" />}
        />
        <NavItem
          label="Favorites"
          count={0}
          icon={<Star className="h-3 w-3" />}
          isActive={sidebarView === "favorites"}
          onClick={() => setSidebarView("favorites")}
        />
        <NavItem
          label="Pinned"
          count={pinnedData.length}
          icon={<Pin className="h-3 w-3" />}
          isActive={sidebarView === "pinned"}
          onClick={() => setSidebarView("pinned")}
        />
        <NavItem
          label="Saved"
          count={0}
          icon={<Archive className="h-3 w-3" />}
          isActive={sidebarView === "saved"}
          onClick={() => setSidebarView("saved")}
        />
        <NavItem
          label="All Requests"
          count={rows.length}
          icon={<Globe className="h-3 w-3" />}
          isActive={sidebarView === "all"}
          onClick={() => setSidebarView("all")}
        />
      </Section>

      <Section
        title="Apps"
        icon={<User className="h-3 w-3" />}
        expanded={appsExpanded}
        onToggle={() => setAppsExpanded(!appsExpanded)}
        count={appData.length}
      >
        {appData.length === 0 ? (
          <Empty />
        ) : (
          appData.map((item) => (
            <Item
              key={item.client}
              label={item.client}
              count={item.count}
              icon={<Monitor className="h-3 w-3" />}
              isActive={clientFilter === item.client}
              onClick={() => setClientFilter(item.client)}
              onClear={clearFilters}
            />
          ))
        )}
      </Section>

      <Section
        title="Domains"
        icon={<Globe className="h-3 w-3" />}
        expanded={domainsExpanded}
        onToggle={() => setDomainsExpanded(!domainsExpanded)}
        count={domainData.length}
      >
        {domainData.length === 0 ? (
          <Empty />
        ) : (
          domainData.map((item) => (
            <div key={item.host}>
              <Item
                label={item.host}
                count={item.count}
                icon={<Globe className="h-3 w-3" />}
                isActive={hostFilter === item.host}
                onClick={() => setHostFilter(item.host)}
                onClear={clearFilters}
              />
              <div className="ml-3 border-l border-line/50 pl-2">
                {item.paths.map((p) => (
                  <Item
                    key={p.path}
                    label={p.path}
                    count={p.count}
                    small
                    onClick={() => setHostFilter(item.host)}
                    onClear={clearFilters}
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

function Section({
  title,
  icon,
  children,
  expanded,
  onToggle,
  count,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  count?: number;
}) {
  return (
    <div className="px-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-muted hover:text-fg transition-colors rounded-md"
        aria-expanded={expanded}
      >
        {icon && <span className="text-muted/50 flex-shrink-0">{icon}</span>}
        <span className="truncate flex-1">{title}</span>
        {count !== undefined && <span className="text-muted/60 text-[10px] font-medium">{count}</span>}
        <ChevronRight
          className={`flex-shrink-0 text-muted/50 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          size={12}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${expanded ? "pb-2 opacity-100 max-h-96" : "pb-0 opacity-0 max-h-0"}`}
      >
        {children}
      </div>
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
  isActive = false,
  onClick,
}: {
  label: string;
  view?: "log" | "overview";
  count?: number;
  icon?: React.ReactNode;
  onViewChange?: (view: "log" | "overview") => void;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const handleClick = () => {
    if (view && onViewChange) onViewChange(view);
    if (onClick) onClick();
  };
  return (
    <div
      onClick={handleClick}
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
  isActive = false,
  onClear,
}: {
  label: string;
  count?: number;
  small?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="relative">
      <div
        onClick={onClick}
        className={`flex cursor-pointer items-center gap-2 px-2 rounded-md hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] transition-colors duration-150 ${small ? "py-0.5 text-xs text-muted" : "py-1.5 text-sm text-fg"} ${isActive ? "bg-[color-mix(in_srgb,var(--mt-accent)_10%,transparent)] text-accent border-l-2 border-accent" : ""}`}
      >
        {icon && <span className="flex-shrink-0 text-muted/50 group-hover:text-fg transition-colors">{icon}</span>}
        <span className="truncate flex-1">{label}</span>
        {count !== undefined && <span className="text-muted/60 text-[10px] font-medium">{count}</span>}
        {isActive && onClear && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="flex-shrink-0 ml-1 p-0.5 rounded text-muted/50 hover:text-danger hover:bg-red-500/10 transition-colors"
            aria-label="Clear filter"
          >
            <X size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Empty-state placeholder. */
function Empty() {
  return <div className="px-3 py-2 text-xs text-muted/50 text-center">No data captured yet</div>;
}