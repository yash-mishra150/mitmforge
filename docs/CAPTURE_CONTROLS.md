# Capture Controls — Recording Pause/Resume & Auto-Save

## Summary
Added two traffic-capture controls to MitmForge:
1. **Recording toggle** — pauses engine emission + body capture without dropping correlation state
2. **Auto-save toggle** — appends every `ProxyEvent` as one JSON line to `<Documents>/MitmForge/traffic-log.jsonl`

## Backend Changes

### `src-tauri/src/proxy.rs`
- `static RECORDING: AtomicBool = true` — master switch
- `pub fn set_recording(enabled: bool)` — callable from IPC
- `fn recording() -> bool` — internal guard
- Emits gated in three sites:
  - `handle_request`: CONNECT rows + regular requests skip `sink(ProxyEvent::Request)` and `BodyStore::insert_request` when off
  - `handle_response`: skips `BodyStore::complete` and `sink(ProxyEvent::Response)`
  - `handle_error`: skips `BodyStore::complete` and 502 `Response` emit
- **Pending queue correlation is untouched** — re-enabling mid-connection stays correct

### `src-tauri/src/commands/proxy.rs`
- `static AUTO_SAVE: AtomicBool = true`
- `static AUTO_SAVE_FILE: Mutex<Option<std::fs::File>>` — append mode, opened once at `proxy_start`
- Log path: `<Documents>/MitmForge/traffic-log.jsonl` (directory created on start)
- Sink closure: when `AUTO_SAVE.load()` is true, `serde_json::to_string(&event)` + `writeln!`
- Commands (return `bool` for typed IPC):
  - `traffic_recording(enabled: bool) -> bool`
  - `traffic_autosave(enabled: bool) -> bool`

### `src-tauri/src/commands/mod.rs`
- Registered both commands in `collect_commands!`

### `src-tauri/tests/proxy_engine.rs`
- New test `recording_off_emits_no_events_then_resumes`:
  1. Starts proxy on 18081
  2. `set_recording(false)` → sends request → asserts **zero events** emitted, body store empty
  3. `set_recording(true)` → sends request → asserts Request+Response events received, body stored

## Frontend Changes

### `src/features/traffic/TrafficGrid.tsx`
- Local optimistic state: `recording`, `autoSave` (both `true` initially)
- Two toggle buttons in header next to System proxy / Trust CA:
  - "Recording on/off" (calls `commands.trafficRecording(target)`)
  - "Auto-save on/off" (calls `commands.trafficAutosave(target)`)
- Function-first styling matching existing header buttons

### `src/features/traffic/store.ts`
- `TrafficRow` adapted to `TrafficEntry_Serialize` union from regenerated bindings
- `addRequest` builds complete row from union fields with `?? null` fallbacks for optional deserialized values

### `src/bindings.ts`
- Regenerated via `npm run gen:bindings` (includes new commands and updated `ProxyEvent`/`TrafficEntry` types from engine-fields)

## Verification
All checks pass:
- `cargo fmt --all`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test -- --test-threads=1` (4 tests: 2 proxy_engine, 1 export_bindings, 1 system_proxy)
- `npm run gen:bindings`
- `npx tsc --noEmit`

## Known Limits
- Auto-save file handle remains open for process lifetime — on crash/kill the last buffered line may be lost (acceptable for local debugging tool)
- Parallel test runs require `--test-threads=1` due to pre-existing `system_proxy` test modifying Windows registry
- Client attribution (`TrafficEntry.client`) may be `None` in test/CI environments where TCP-table lookup fails

## Files Touched
```
src-tauri/src/proxy.rs
src-tauri/src/commands/proxy.rs
src-tauri/src/commands/mod.rs
src-tauri/tests/proxy_engine.rs
src/features/traffic/TrafficGrid.tsx
src/features/traffic/store.ts
src/bindings.ts
```