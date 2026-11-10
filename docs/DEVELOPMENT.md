# Development

## Setup

1. Windows 10/11 with MSVC Build Tools + WebView2 (preinstalled on Win 11)
2. Node.js 20+, Rust 1.85+ (`rustup default stable`)
3. `npm install`

## Commands

```sh
npm run tauri dev      # app with hot reload on both sides (Vite :1420 strict + Rust)
npm run tauri build    # typecheck (tsc) + vite build + Rust release bundle
npm run gen:bindings   # regenerate src/bindings.ts (cargo test --test export_bindings)
npx tsc --noEmit       # frontend typecheck only
cargo test             # in src-tauri/ — engine e2e + system-proxy roundtrip + bindings drift
cargo clippy --all-targets -- -D warnings   # in src-tauri/
cargo fmt --all        # in src-tauri/
```

`npm run build` (plain vite build) is **not** the app build — use `npm run tauri build`.

## Running a single test

```sh
cd src-tauri
cargo test --test proxy_engine     # engine e2e (proxy on 127.0.0.1:18080, no network needed)
cargo test --test system_proxy     # enable/disable roundtrip (touches the registry)
cargo test --test export_bindings  # regenerates src/bindings.ts
```

## When you change IPC types

1. Add/modify the command or event (derive `Serialize`, `Deserialize`, `specta::Type`).
2. Register it in `src/commands/mod.rs::builder()`.
3. `npm run gen:bindings` and commit `src/bindings.ts`.

## Gotchas (learned the hard way — see also AGENTS.md)

- **Commands must live in a child module** of wherever `collect_commands!` runs; same-module registration collides (E0255).
- **Never re-lock a `static Mutex` you already hold** — `system_proxy::enable()` once deadlocked exactly this way; the system-proxy roundtrip test exists to catch it.
- Test executables need the comctl32 v6 manifest; `build.rs` already links it package-wide — keep it that way or tests die with `STATUS_ENTRYPOINT_NOT_FOUND`.
- Vite + `devUrl` are pinned to `127.0.0.1` — Node otherwise binds `::1` only and the WebView loads nothing.
- `tauri::async_runtime::spawn`ed tasks must finish before exit or teardown hangs; the engine takes a shutdown future and `RunEvent::ExitRequested` triggers it.
- The dev terminal shows Rust `eprintln!` output — use it for engine diagnostics; the webview console needs DevTools (right-click in debug builds).

## Debug build times

First `tauri dev` compiles the full Tauri stack (~minutes). Subsequent incremental builds are fast. `cargo clippy` only checks; it doesn't make the first launch fast.
