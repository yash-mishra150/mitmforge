# Roadmap

Status: ✅ done · 🔜 planned · ⏸ deferred. Ordered by phase; phases 3a → 5 are the active track.

## Phase 1–2 — capture core ✅

- ✅ MITM proxy engine (hudsucker, HTTP/1.1), traffic events streamed live
- ✅ Root CA: persistent, one-click install (`certutil -user -addstore Root`), Key Usage correct
- ✅ Blind-tunnel TLS until CA trusted — system capture never blocks browsing
- ✅ System proxy: auto-on at launch, live refresh, bypass list, restore on exit, crash healing
- ✅ Traffic grid: virtualized, 10k ring, status/method colors, durations, CONNECT rows
- ✅ Inspector: request/response headers + bodies (lazy fetch)
- ✅ Lifecycle: single instance, port pre-check, clean shutdown, proxy restore on close

## Phase 3a — data + views (current work)

- ✅ Engine fields: scheme/SSL flag, content-type (request + response), byte sizes
- ✅ Client attribution: which app/process sent each request (Windows TCP table → PID → process name)
- 🔜 Sidebar: Capture ▸ Overview / Favorites ▸ Pinned, Saved / All ▸ Apps, Domains (host → path tree) — ✅ function-first (Apps / Domains tree / Pinned + host & app filters); grouped tabs + design pass pending
- ✅ Main log columns: markers + comment (edited/tools deferred until their features exist)
- ✅ Filter bar: content types (JSON/Form/XML/JS/CSS/GraphQL/Document/Media/Other) + status classes (1xx–5xx)
- ✅ Row detail pane upgrade: headers, query, raw, bodies per tab (+ pin toggle)
- ✅ Recording pause/resume (engine keeps correlating while paused; events withheld)
- ✅ Auto-save logs to Documents (JSONL), disable-able (`Documents\MitmForge\traffic-log.jsonl`, on by default)
- ✅ Overview dashboard: requests, data transferred, errors, avg duration, status breakdown, top apps/domains, slowest requests, response-time buckets (CSS charts, no chart lib)

- ✅ UI design pass (first): "Linear/Vercel dark" — theme tokens (`src/theme/theme.tsx`, CSS vars + Tailwind `@theme inline` semantic colors), Inter + JetBrains Mono, pill chips, status bar, unified tabbed Settings (AI ▸ Theme with live preview)

## Phase 3b — tools

- 🔜 Compose: Postman-style client; drag a captured request → edit → replay
- 🔜 AI (BYOK): provider config for any OpenAI-compatible endpoint (OpenRouter `https://openrouter.ai/api/v1`, local runtimes like `http://localhost:1235/v1`) + per-request actions: Explain Error ✅ ("Ask AI" in row detail), Generate Mock (→ Map Local), Code Generation (curl/fetch/reqwest), prompt-driven payload scripting, suspicious-request flagging ✅ (batch over newest 50 rows; ⚠ in grid, sidebar + overview sections). MCP later.
- 🔜 Settings page (AI keys ✅, theme tokens ✅ — `src/theme/theme.tsx` CSS vars with live preview; auto-save, listen-on pending)

## Phase 4 — devices

- 🔜 Listen on: localhost / LAN (prerequisite for phones)
- 🔜 Android via adb: auto-detect adb (PATH / ANDROID_HOME / Studio paths) with in-app one-click download of Google platform-tools; set device proxy; one-click CA install into emulator system store; phone traffic labeled by device
- 🔜 WebSocket interception (hudsucker supports it)

## Phase 5 — traffic manipulation (the "unlimited" core)

- 🔜 Map Local — serve local files, override status/headers
- 🔜 Map Remote — regex/wildcard host/path redirects
- 🔜 Active Breakpoints — pause request/response mid-flight, edit, execute
- 🔜 GraphQL parsing — per-operation filtering/breakpoints
- 🔜 Rule groups, pinning, global pause/resume, source conditions (regex/wildcard)

## Deferred / backlog

- ⏸ Advanced body previewers (Hex, Protobuf, MessagePack, JWT, form-encoded)
- ⏸ Editor stack (Monaco/CodeMirror) for body editing
- ⏸ Reverse proxy, scripting engine, Diff, network conditions (throttling), custom certificates
- ⏸ External proxy chaining / PAC / bypass lists
- ⏸ Browser extension interception mode (Requestly-style)
- ⏸ Sessions: record/replay/share, HAR import/export (JSONL today; design toward HAR)
- ⏸ Real remote/cloud proxying, iOS support, macOS/Linux ports
