import type { ReactNode } from "react";
import { useTraffic } from "./store";
import { groupByApp, buildDomainTree, pinnedRows } from "./selectors";

/** Sidebar views: Apps (process names), Domains (host → path tree), Pinned rows. */
export function Sidebar() {
  const rows = useTraffic((s) => s.rows);
  const pinned = useTraffic((s) => s.pinned);
  const setHostFilter = useTraffic((s) => s.setHostFilter);
  const setClientFilter = useTraffic((s) => s.setClientFilter);
  const select = useTraffic((s) => s.select);
  const suspicious = useTraffic((s) => s.suspicious);

  const appData = groupByApp(rows);
  const domainData = buildDomainTree(rows);
  const pinnedData = pinnedRows(rows, pinned);

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-auto border-r border-neutral-800 bg-neutral-900">
      <Section title="Apps">
        {appData.length === 0 ? (
          <Empty />
        ) : (
          appData.map((item) => (
            <Item key={item.client} onClick={() => setClientFilter(item.client)} count={item.count}>
              {item.client}
            </Item>
          ))
        )}
      </Section>

      <Section title="Suspicious">
        {Object.entries(suspicious).length === 0 ? (
          <Empty />
        ) : (
          Object.entries(suspicious).map(([idStr, reason]) => {
            const id = Number(idStr);
            const row = rows.find((r) => r.id === id);
            if (!row) return null;
            return (
              <Item key={id} onClick={() => select(id)}>
                <div className="flex flex-col">
                  <div>{row.method} {row.url.slice(0, 40)}</div>
                  <div className="text-xs text-neutral-500">⚠ {reason}</div>
                </div>
              </Item>
            );
          })
        )}
      </Section>

      <Section title="Domains">
        {domainData.length === 0 ? (
          <Empty />
        ) : (
          domainData.map((item) => (
            <div key={item.host}>
              <Item onClick={() => setHostFilter(item.host)} count={item.count}>
                {item.host}
              </Item>
              <div className="ml-3 border-l border-neutral-800 pl-2">
                {item.paths.map((p) => (
                  <Item key={p.path} onClick={() => setHostFilter(item.host)} count={p.count} small>
                    {p.path}
                  </Item>
                ))}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Pinned">
        {pinnedData.length === 0 ? (
          <Empty />
        ) : (
          pinnedData.map((row) => (
            <Item key={row.id} onClick={() => select(row.id)}>
              {row.method} {row.url.slice(0, 40)}
            </Item>
          ))
        )}
      </Section>
    </div>
  );
}

/** Section heading + content block. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-neutral-800">
      <div className="px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">{title}</div>
      <div className="pb-1">{children}</div>
    </div>
  );
}

/** One clickable sidebar entry with an optional count badge. */
function Item({
  children,
  count,
  small,
  onClick,
}: {
  children: ReactNode;
  count?: number;
  small?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center justify-between px-3 hover:bg-neutral-800 ${small ? "py-0.5 text-xs text-neutral-400" : "py-1 text-sm text-neutral-300"}`}
    >
      <span className="truncate">{children}</span>
      {count !== undefined && <span className="text-neutral-600">{count}</span>}
    </div>
  );
}

/** Empty-state placeholder. */
function Empty() {
  return <div className="px-3 py-1 text-xs text-neutral-600">—</div>;
}
