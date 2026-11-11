# Architecture

MitmForge is a Tauri 2 desktop app: a React frontend (TypeScript) driving a Rust backend that runs an MITM proxy engine. This document describes the wiring as it exists today.

## Big picture

```
┌────────────────────── webview (React) ──────────────────────┐
│  features/traffic/store (zustand, 10k ring, 50ms batching)  │
│      ↑ events ("proxy://event")      ↓ commands (typed)     │
└────────────────────────────┬────────────────────────────────┘
                             │ tauri IPC (specta-generated bindings)
┌────────────────────────────┴────────────────────────────────┐
│ src-tauri                                                    │
│  commands/  — thin typed IPC adapters (tauri-specta)         │
│  proxy.rs   — MITM engine (hudsucker), Tauri-free            │
│  client.rs  — client attribution (Windows TCP table → name)  │
│  system_proxy.rs — Windows system proxy control              │
└──────────────────────────────────────────────────────────────┘
        ↕ sockets
   apps on this machine  ⇄  engine :8080  ⇄  real servers
```

## Backend

### `src/proxy.rs` — the engine (Tauri-free)

- Built on [`hudsucker`](https://docs.rs/hudsucker) 0.25 (hyper 1.x, rustls 0.23). CA + leaf certificates via `rcgen`.
- **Tauri-free by design**: the engine never imports Tauri types. It emits `ProxyEvent`s through a `Sink = Arc<dyn Fn(ProxyEvent) + Send + Sync>` and takes its body store and shutdown future as parameters — testable headless (`tests/proxy_engine.rs` runs a real exchange).
- **Events**: `ProxyEvent::Request { entry: TrafficEntry }` (id, method, url, timestamp, scheme, request content-type/size, `client` process name) and `ProxyEvent::Response { id, status, duration_ms, res_content_type, res_size }`. Responses patch rows by id.
- **Recording**: `set_recording()` gates event emission only — the engine keeps parsing and correlating while paused, so resuming loses nothing mid-flight. Toggled via the `traffic_recording` command.
- **Auto-save**: the commands layer appends every emitted event as one JSON line to `<Documents>\MitmForge\traffic-log.jsonl` (on by default, `traffic_autosave` toggle, file opened at `proxy_start`).
- **Correlation**: hudsucker passes each request/response pair to the same handler instance, so a FIFO queue (`pending`) correlates responses to requests. Sequential HTTP/1.1 only (hudsucker's `http2` feature is off; multiplexing needs different plumbing).
- **Bodies**: tee capture — every chunk forwards untouched while up to 64 KB is copied into `BodyStore` (500 exchanges, FIFO eviction). Never buffers or corrupts streams. The UI fetches bodies lazily via the `traffic_body` command (BRD: lazy-load heavy payloads).
- **Headers** are captured synchronously and stored alongside bodies.
- **CONNECT tunnels**: logged like Proxyman (with headers, answered 200 by interception), kept out of the correlation queue.
- **TLS decision**: `should_intercept_tls` follows the CA-trusted state. No trusted CA → blind tunnel (real certificates pass through, nothing breaks, only CONNECT rows show). CA installed → decrypt. `set_intercept_tls()` flips it at launch and when Trust CA succeeds.
- **Certificates**: the CA (`ca.cer` + `ca.key`) persists in the app-data dir and is loaded on subsequent runs; regenerated only if missing. It carries `digitalSignature | keyCertSign | cRLSign` (Windows rejects CA chains without `keyCertSign`).

### `src/commands/` — IPC adapters

One file per domain, `#[tauri::command] #[specta::specta]`, registered in `commands/mod.rs::builder()`. **Do not define a command in the same module as its `collect_commands!` reference** — the macro re-imports the command's generated macros into the calling module and collides (E0255).

- `proxy_start` — starts the engine once (port pre-check fails fast), spawns it on Tauri's runtime, and auto-enables system capture when the port is actually bindable. The engine starts from the frontend *after* the event listener attaches, so early traffic isn't lost.
- `proxy_status` / `proxy_install_ca` / `proxy_set_system` / `traffic_body` — status pills, certutil install, capture toggle, lazy bodies.
- `traffic_recording` / `traffic_autosave` — pause/resume event emission; JSONL auto-save toggle.

### `src/client.rs` — client attribution (Windows)

- Resolves which local process opened each connection: `GetExtendedTcpTable` rows matched on the proxy's client port (ports arrive in network byte order — swapped manually), PID → executable name, cached per launch.
- Best-effort by design: returns `None` on non-Windows, lookup failure, or no matching row — the engine never panics on attribution.

### `src/system_proxy.rs` — Windows system proxy

- Writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` (`ProxyEnable`, `ProxyServer`, `ProxyOverride`) and broadcasts `InternetSetOptionW(SETTINGS_CHANGED | REFRESH)` so browsers pick it up live.
- Adds `localhost;127.0.0.1;<local>` to the user's existing bypass list; the previous settings are restored on app exit.
- **Healing**: if the saved "previous" state is our own proxy (left by a crashed session), it is treated as OFF, so one clean close always un-breaks browsing.
- `ca_trusted()` checks the user Root store via `certutil`, once per launch, cached.

### Lifecycle

- `tauri-plugin-single-instance`: a second launch focuses the running app instead of spawning a port-fighting clone.
- Exit: `RunEvent::ExitRequested|Exit` → signal the engine's shutdown (watch channel), restore the system proxy, wait up to 3 s for the engine task. Without this the runtime teardown waits forever and the process is killed before the restore runs.
- The frontend calls `proxyStart` only after attaching its event listener.

## Frontend

- `src/bindings.ts` — generated by tauri-specta (`npm run gen:bindings` = `cargo test --test export_bindings`). Never hand-edit; commit after IPC type changes. `u64` fields require the `dangerously_cast_bigints_to_number()` builder option (already set).
- `src/platform/ipc.ts` — `call()` unwraps tauri-specta's `typedError` results.
- `src/features/traffic/` — the capture feature:
  - `store.ts` (zustand): 10 000-row ring buffer, requests prepend, responses patch by id, events coalesced into one store update per 50 ms.
  - `TrafficGrid.tsx`: `@tanstack/react-virtual` grid with memoized rows (only patched rows re-render), status/method color coding, SSL + Client columns, header controls (recording pause/resume, auto-save, system proxy toggle, Trust CA, clear).
- Events arrive on a single channel `proxy://event` whose payload is the tagged `ProxyEvent` union; the frontend narrows on `payload.type` (same pattern as OpenIDEA's `ide://event`).

## Windows specifics

- `build.rs` links `windows-app-manifest.xml` (comctl32 v6) into **every** binary of the package, including test executables — without it they die at load with `STATUS_ENTRYPOINT_NOT_FOUND` (comctl32 v6-only exports like `TaskDialogIntirect` are unreachable without the manifest).
- The crate is `mitmforge_lib` (lib/bin name collision on Windows) — do not rename.
- Vite and `devUrl` are pinned to `127.0.0.1:1420` (Node may otherwise bind `::1` only, which the WebView cannot reach).
