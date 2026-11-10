# MitmForge

A free, open-source **native HTTP/HTTPS debugging proxy** for Windows — the Proxyman/Charles experience, rebuilt with Tauri 2 + Rust. No subscriptions, no feature paywalls, uncapped.

> Status: **early development** (Phase 3 of the roadmap). The capture core works on Windows today; UI and traffic-modification features are being built. See [docs/ROADMAP.md](docs/ROADMAP.md).

## What it does today

- **System-wide capture** — one toggle routes every proxy-aware app (browsers, Node, curl, Electron apps) through MitmForge, automatically restored when you quit
- **Live traffic grid** — every request/response streaming in real time: method, URL, status, duration, timing
- **HTTPS decryption** — one-click Root CA install; untrusted tunnels pass through untouched so nothing ever breaks
- **Inspector** — click a row to see request/response headers and bodies
- **Safe by design** — app close restores your previous proxy settings; a crashed session self-heals on the next launch; single-instance guard prevents port fights

## Requirements

- **Windows** 10/11 (macOS/Linux planned)
- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) 1.85+ (edition 2024)
- MSVC Build Tools + WebView2 (preinstalled on Windows 11)

## Run it

```sh
npm install
npm run tauri dev      # dev build with hot reload
npm run tauri build    # production build + installer
```

First launch: click **Trust CA** (installs the root certificate into your user store — no admin), then **System proxy on**. Browse. Everything appears.

## Safety notes

- Installing the CA means trusting MitmForge to decrypt HTTPS on this machine. Uninstall any time: `certutil -user -delstore Root "MitmForge Root CA"` (or via `certmgr.msc`).
- Antivirus with SSL filtering (e.g. ESET) stacks its own certificate layer on top of all TLS traffic; MitmForge coexists with it.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — how the engine, IPC and UI fit together
- [Development](docs/DEVELOPMENT.md) — setup, commands, testing
- [Troubleshooting](docs/TROUBLESHOOTING.md) — certificates, proxy stuck, AV interference
- [Roadmap](docs/ROADMAP.md) — what's done and what's next
- [AGENTS.md](AGENTS.md) — guide for AI coding agents working in this repo

## License

TBD before first public release.
