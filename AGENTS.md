# AGENTS.md — MitmForge

## What this is

Native HTTP/HTTPS MITM debugging proxy (Proxyman/Charles alternative), built with Tauri 2 + React 19 + TypeScript + Rust. Phase 1 in progress: `src-tauri/src/proxy.rs` runs a hudsucker 0.25 MITM engine on `127.0.0.1:8080` with an in-memory CA, logging decrypted traffic to stdout (no IPC/UI yet). Product spec lives in `docs/next_gen_proxy_brd.md` (virtualized traffic grid, breakpoints, map local/remote, OpenRouter AI) — read it before designing features; it says React 18/Tailwind v3, reality is React 19 + Tailwind v4 (vite plugin, no `tailwind.config`).

## Commands

```sh
npm run tauri dev      # dev app: starts Vite + Rust, hot reload both sides
npm run tauri build    # typecheck (tsc) + vite build + Rust release bundle
npx tsc --noEmit       # frontend typecheck only (fast, no dist written)
cargo check            # Rust check only — run inside src-tauri/, works without dist/
cargo test             # inside src-tauri/ (no tests exist yet)
```

- No lint, formatter, tests, or CI configured. `npm run build` (plain vite build) is **not** the app build — use `npm run tauri build`.
- Dev server port **1420 is hard-required and `strictPort`** — never change it or run `vite` on another port; Tauri expects it. HMR uses 1421 when `TAURI_DEV_HOST` is set.
- Toolchain: Node 20+, Rust with edition-2024 support (1.85+). Windows needs MSVC + WebView2.

## Layout & wiring

- `src/` — React frontend (entry `src/main.tsx` → `App.tsx`).
- `src-tauri/` — Rust backend. Crate is named `mitmforge_lib` (lib/bin name collision on Windows — do not rename).
- Adding a Tauri command: define `#[tauri::command]` in `src-tauri/src/lib.rs` **and** add it to `tauri::generate_handler![...]`, else invoke fails at runtime with "unknown command". Call from TS with `invoke("name", { args })` from `@tauri-apps/api/core`; JS camelCase args map to Rust snake_case.
- Window/IPC permissions: `src-tauri/capabilities/default.json` (currently only `core:default` + `opener:default` — new plugins need entries here or IPC is denied). App config: `src-tauri/tauri.conf.json`.
- Generated — never hand-edit: `src-tauri/gen/schemas/`, `src-tauri/target/`, `node_modules/`.
- `src-tauri/src/main.rs` has `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` — required on Windows, do not remove.

## Repo state

- No `.git` yet (as of writing) — `git`/commit workflows need `git init` first.
- Planned stack not yet present: Tailwind, TanStack Virtual/AG Grid, Monaco/CodeMirror, `hudsucker`. Don't assume they're installed.
