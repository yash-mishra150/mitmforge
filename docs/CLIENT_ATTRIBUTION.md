# Client Process Attribution (Apps Column)

## Overview

Each captured HTTP/HTTPS request is now attributed to the local process that originated it — analogous to Proxyman's "Apps" column or Charles' "Client" field.

## Implementation

### Backend (Rust)

| File | Change |
|------|--------|
| `src/client.rs` (new) | Windows `GetExtendedTcpTable` with `TCP_TABLE_OWNER_MODULE_CONNECTIONS` to find the owning PID for the `client_addr → proxy_addr` socket pair, then `OpenProcess` + `QueryFullProcessImageNameW` to resolve the executable name (file name only). Non-Windows stub returns `None`. |
| `src/proxy.rs` | `TrafficEntry` gains `client: Option<String>`. `EmitHandler` stores `proxy_addr` (the proxy's listen address) and resolves attribution in `handle_request()` before emitting the `Request` event. |
| `src/commands/proxy.rs` | Passes the bind address (`127.0.0.1:8080`) as `proxy_addr` to `proxy::start()`. |
| `Cargo.toml` | Added `windows-sys` with features `Win32_NetworkManagement_IpHelper`, `Win32_Foundation`, `Win32_Networking_WinSock`, `Win32_System_Threading`. |

**Key details:**
- Port numbers in the TCP table are in network byte order → manual `ntohs` swap before comparing.
- Result cached in `LazyLock<Mutex<HashMap<u32, String>>>` (PID → name) to avoid repeated syscalls.
- Never panics: all failures return `None`.

### Frontend (TypeScript/React)

| File | Change |
|------|--------|
| `src/bindings.ts` | Regenerated via `npm run gen:bindings`; `TrafficEntry_Serialize` includes `client: string \| null`. |
| `src/features/traffic/store.ts` | `TrafficRow` already extends `TrafficEntry_Serialize`, so `client` flows through automatically. |
| `src/features/traffic/TrafficGrid.tsx` | Added "Client" column (5rem) displaying `row.client ?? "—"`. |

## Testing

`src-tauri/tests/proxy_engine.rs::logs_plain_http_exchange`:
- Opens a real TCP connection to the test proxy.
- Verifies the `Request` event contains a `client` field (accessible, may be `None` in CI/test environments where the TCP table lookup doesn't resolve the test process).

All test suites pass:
```
cargo test  # 4 suites: export_bindings, proxy_engine (2), system_proxy
```

## User Experience

| Before | After |
|--------|-------|
| No process info | Grid shows process name (e.g., `chrome.exe`, `curl.exe`, `python.exe`) or "—" when unresolved |

## Limitations

- **Windows only** — non-Windows platforms always show "—".
- **TCP table timing** — the connection must still be in the OS table when the request handler runs; very short-lived connections *might* be missed (mitigated by the fact that the proxy holds the connection open while handling).
- **No admin required** — `PROCESS_QUERY_LIMITED_INFORMATION` works for processes the user owns.
- **IPv4 only** — `AF_INET` table; IPv6 client connections resolve to `None`.

## Future Enhancements

- Add process icon (extract from executable).
- Group/filter by client in the UI.
- Show PID alongside name.
- IPv6 support (`TCP6_TABLE_OWNER_MODULE_CONNECTIONS`).