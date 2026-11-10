# Troubleshooting

## All websites stopped loading while MitmForge is closed

A crashed session (kill, power loss) can leave the system proxy pointing at the dead engine. Two fixes:

- Relaunch MitmForge once and close it normally — the restore logic detects the poisoned state and turns the proxy off.
- Manually: Windows Settings → Network → Proxy → turn "Use a proxy server" **off**.

## Certificate commands

```sh
# install (what the "Trust CA" button runs; user store, no admin)
certutil -user -addstore Root "%APPDATA%\com.user.mitmforge\ca.cer"

# verify it is present
certutil -user -store Root | findstr MitmForge

# uninstall
certutil -user -delstore Root "MitmForge Root CA"
```

After installing/uninstalling, restart the browser once — open connections keep the old decision.

## HTTPS sites work but show only CONNECT rows

Expected without a trusted CA: tunnels are logged (domain only) and pass through untouched. Install the CA (Trust CA), restart the browser, then requests decrypt into full detail.

## "port 8080 is already in use"

Another MitmForge instance (or another program) holds the port. MitmForge is single-instance — launching again focuses the running app. To find the holder: `netstat -ano | findstr :8080` → `tasklist /fi "PID eq <pid>"`.

## Antivirus with SSL filtering (ESET, Kaspersky, …)

These stack their own trusted certificate layer on **all** outbound TLS — including traffic to localhost proxies. Consequences:

- Certificates presented to browsers may show the AV's issuer instead of MitmForge's.
- Local proxies rarely cert-block on such machines; if sites break with the AV enabled, exclude the MitmForge port or disable the AV's SSL filtering while debugging.

## Logs look empty for GET / 204 / 304 rows

Not a bug: those have no body by HTTP definition. Headers are always captured and shown.

## Dev-mode: window opens but is blank / engine never starts

- Vite must be reachable at `http://127.0.0.1:1420` — the config pins it; if you changed it, keep both `vite.config.ts` and `tauri.conf.json devUrl` on the same IPv4 address (Node may bind `::1` only, which the WebView can't reach).
- Check the dev terminal for `🚀 MitmForge Proxy Engine listening on 127.0.0.1:8080` and any `proxy engine stopped:` line.
