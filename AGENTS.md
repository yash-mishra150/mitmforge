# AGENTS.md — MitmForge

Guide for AI coding agents working in this repo. Pair with `docs/ARCHITECTURE.md` (how it fits together), `docs/DEVELOPMENT.md` (commands), `docs/ROADMAP.md` (status/plan), `docs/TROUBLESHOOTING.md` (user-facing fixes).

## What this is

Native HTTP/HTTPS MITM debugging proxy (Proxyman/Charles alternative), Tauri 2 + React 19 + TypeScript + Rust, Windows-first. Capture core works end-to-end; per `docs/ROADMAP.md`, Phase 3a (engine fields, client attribution, sidebar views, filters, analytics, recording, auto-save) is the active track. Product spec: `docs/next_gen_proxy_brd.md` — it predates the code; where they disagree the code is newer.

## Commands

```sh
npm run tauri dev      # app with hot reload (Vite 127.0.0.1:1420 strict + Rust)
npm run tauri build    # typecheck + vite build + Rust release bundle
npm run gen:bindings   # regenerates src/bindings.ts (cargo test --test export_bindings)
npx tsc --noEmit       # frontend typecheck only
cargo test             # in src-tauri/: engine e2e (18080), system-proxy roundtrip, bindings drift
cargo clippy --all-targets -- -D warnings   # in src-tauri/
cargo fmt --all        # in src-tauri/
```

`npm run build` (plain vite build) is not the app build. No CI configured yet.

## Hard rules (each one fixed a real bug)

- **Commands live in child modules** of where `collect_commands!` runs — same-module registration collides (E0255).
- **Never re-lock a `static Mutex` you already hold** — `system_proxy::enable()` once self-deadlocked and black-holed all browsing; `tests/system_proxy.rs` guards it.
- **Engine is Tauri-free**: no `tauri` types in `src/proxy.rs`; emit via `Sink`, take store/shutdown as params. Keeps it headless-testable.
- **Spawned async tasks must finish before exit** — engine takes a shutdown future; `RunEvent::ExitRequested` signals it, restores the system proxy, then waits ≤3 s. Skip this and close hangs (`0xffffffff`) with the proxy left broken.
- **Test binaries need the comctl32 v6 manifest** — `build.rs` links it package-wide; don't remove, or tests die at load (`STATUS_ENTRYPOINT_NOT_FOUND`).
- **Keep Vite + `devUrl` pinned to `127.0.0.1:1420`** — Node otherwise binds `::1` only and the WebView loads nothing.
- **`src/bindings.ts` is generated** (`npm run gen:bindings`) — never hand-edit; commit after IPC changes; `u64` needs the builder's `dangerously_cast_bigints_to_number()` (set).
- Crate is `mitmforge_lib` (Windows lib/bin collision) — do not rename.

## Architecture in one breath

`src/proxy.rs` engine (hudsucker 0.25, in-memory-CA-file persistence, tee body capture ≤64 KB into `BodyStore` ≤500 exchanges, FIFO request/response correlation, CONNECT rows logged outside the queue, scheme/content-type/size metadata, `set_recording()` event gating) → `Sink` → one tagged `proxy://event` channel → zustand store (10k ring, 50 ms batching) → virtualized grid. Client attribution (`src/client.rs`: Windows TCP table → PID → name, best-effort None). JSONL auto-save + recording toggle live in `commands/proxy.rs`. TLS decrypts only when the CA is trusted; otherwise blind tunnel. System proxy lives in `src/system_proxy.rs` (HKCU registry + WinINet refresh, previous-state healing, certutil-based `ca_trusted()` cached per launch).

## Conventions

- Minimal function-first UI for now (raw text/JSON panels); design pass comes later — don't invest in styling.
- New features: backend command + specta types first, frontend via `call(commands.x())` from `src/platform/ipc.ts`.
- Add tests for engine-level logic (see `tests/proxy_engine.rs` pattern: real exchange through the proxy, local upstream, no network).
- shortcut: comments in code marked `shortcut:` document known limits — upgrade them when the limit bites.
- Keep `docs/` and this file current as features land; docs are part of the deliverable.

## Agent lanes — how changes are built (free subagents)

Lanes are configured globally in `~/.config/opencode/opencode.jsonc` (`mode: "subagent"`, OpenRouter `:free` models, three separate rate-limit buckets). Any OpenCode primary session in this repo can dispatch them directly — no worktrees needed unless lanes would collide (see ownership).

| Lane | Model | Scope |
|---|---|---|
| `coder` | `openrouter/nvidia/nemotron-3.5-super-vl:free` | Rust engine: `src-tauri/src/proxy.rs`, `client.rs`, `system_proxy.rs`, engine tests |
| `coder2` | `openrouter/google/gemma-4-31b-it:free` | Frontend: `src/features/**`, TypeScript, store/grid, UI tests |
| `worker` | `openrouter/baidu/ernie-5.5-flash-preview:free` | Docs, mechanical edits, lint fixes, repetitive patches |

**Protocol** (architect = the premium orchestrator session; free lanes never self-verify):

1. Architect decomposes the feature into per-lane specs: exact files, exact shape, which Hard rules apply, tests to add. Small tasks — free models drift on big ones.
2. Dispatch lanes in parallel only when file scopes don't overlap (ownership table above prevents most conflicts; `src/bindings.ts` and `commands/` are architect-owned).
3. Architect reviews every diff against the spec, then runs the gate: `cargo fmt --all` + `cargo clippy --all-targets -- -D warnings` + `cargo test` (in `src-tauri/`) + `npm run gen:bindings` + `npx tsc --noEmit`. Green or it doesn't land.
4. Architect owns: merge conflict resolution, `src/bindings.ts` (regenerated, never hand-edited), engine decisions in `proxy.rs`, commits, push, docs updates.
5. Two retries on a lane, then the architect does it itself — no death spirals on free models.

**Running it directly from OpenCode:** open `opencode` in the repo and ask the session to run the batch — the session dispatches `coder`/`coder2`/`worker` as subagents. One-shot smoke test of a lane's model without an agent: `opencode run -m <exact model id> "Reply with exactly: OK"`. Launching separate `opencode` sessions per lane is unnecessary; parallelism comes from dispatching multiple subagents in one session.

**Model changes:** free-tier IDs churn. Verify with an exact-string search (fuzzy search misses variants — missed `ernie-5.5-flash-preview:free` and `nemotron-3-ultra-550b-a55b:free` twice), smoke-test with `opencode run`, then commit. Known dead: `nvidia/nemotron-3-ultra-550b-a55b:free` returns corrupted mojibake on the free route (2026-11-11) — retest before promoting. Fallbacks: heavy → gemma; worker → `openrouter/cohere/north-mini-code:free`.
