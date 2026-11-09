//! IPC adapters for the proxy engine, CA trust and system-proxy capture.

use crate::{PROXY_EVENT, ProxyError};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter, Manager, State};

static STARTED: AtomicBool = AtomicBool::new(false);

/// Starts the proxy engine once; traffic streams to the UI as `ProxyEvent`s.
/// Called from the frontend *after* the event listener is attached, so early
/// traffic is not lost. Proxyman-style: the system proxy turns on
/// automatically, but only when the CA is trusted and the port is free — we
/// never route traffic into a dead proxy. shortcut: if the engine dies,
/// restarting needs an app relaunch (STARTED never resets); a lifecycle
/// command set fixes that later.
#[tauri::command]
#[specta::specta]
pub async fn proxy_start(
    app: AppHandle,
    store: State<'_, crate::proxy::SharedStore>,
) -> Result<(), ProxyError> {
    if STARTED.swap(true, Ordering::SeqCst) {
        return Err(ProxyError::AlreadyRunning);
    }
    // Fail fast when the port is taken instead of silently breaking browsing.
    let addr: std::net::SocketAddr = "127.0.0.1:8080".parse().unwrap();
    if std::net::TcpListener::bind(addr).is_err() {
        STARTED.store(false, Ordering::SeqCst);
        return Err(ProxyError::Io {
            message: "port 8080 is already in use".into(),
        });
    }

    let ca_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| ProxyError::Internal {
            message: e.to_string(),
        })?;
    // Decrypt only what we can; everything else passes through untouched.
    crate::proxy::set_intercept_tls(crate::system_proxy::ca_trusted());
    let sink_app = app.clone();
    let sink: Arc<dyn Fn(crate::proxy::ProxyEvent) + Send + Sync> = Arc::new(move |event| {
        if let Err(e) = sink_app.emit(PROXY_EVENT, &event) {
            eprintln!("emit proxy event failed: {e}");
        }
    });
    let store = store.inner().clone();
    tauri::async_runtime::spawn(async move {
        // Readiness gate: only point the system proxy at a proxy that is
        // actually about to listen. (A previous instance holding the port
        // would otherwise route traffic into an invisible/dead process.)
        let port_free = std::net::TcpListener::bind(addr).is_ok();
        if port_free && let Err(e) = crate::system_proxy::enable("127.0.0.1:8080") {
            eprintln!("system proxy auto-enable failed: {e}");
        } else if !port_free {
            eprintln!("port 8080 is held by another process; system proxy not enabled");
        }
        if let Err(e) = crate::proxy::start(sink, addr, Some(&ca_dir), store).await {
            eprintln!("proxy engine stopped: {e}");
        }
    });
    Ok(())
}

/// What the header pills show.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ProxyStatus {
    /// The engine was started in this app run.
    pub listening: bool,
    /// Windows system proxy on/off (`None` if it cannot be read).
    pub system_proxy: Option<bool>,
    /// Our CA is in the trust store; required before system proxy is offered,
    /// otherwise enabling it only breaks every HTTPS site.
    pub ca_trusted: bool,
}

#[tauri::command]
#[specta::specta]
pub fn proxy_status() -> ProxyStatus {
    ProxyStatus {
        listening: STARTED.load(Ordering::SeqCst),
        system_proxy: crate::system_proxy::current(),
        ca_trusted: crate::system_proxy::ca_trusted(),
    }
}

/// Installs the persisted CA cert into the current user's Root store via
/// `certutil` (no admin; Chrome/Edge/WebView2 trust the user Root store).
#[tauri::command]
#[specta::specta]
pub async fn proxy_install_ca(app: AppHandle) -> Result<String, ProxyError> {
    let cer = app
        .path()
        .app_data_dir()
        .map_err(|e| ProxyError::Internal {
            message: e.to_string(),
        })?
        .join("ca.cer");
    if !cer.exists() {
        return Err(ProxyError::Internal {
            message: "CA not generated yet; start the proxy first".into(),
        });
    }
    let out = tokio::process::Command::new("certutil")
        .args(["-user", "-addstore", "Root"])
        .arg(&cer)
        .output()
        .await
        .map_err(|e| ProxyError::Io {
            message: e.to_string(),
        })?;
    if out.status.success() {
        crate::system_proxy::mark_ca_installed();
        // New tunnels decrypt from now on; already-open connections keep
        // tunneling until the client reconnects.
        crate::proxy::set_intercept_tls(true);
        Ok("Certificate added to the user Root store. Restart the browser once, then HTTPS shows decrypted.".into())
    } else {
        Err(ProxyError::Internal {
            message: format!(
                "certutil failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ),
        })
    }
}

/// Toggles Windows system-wide proxy capture (what Proxyman's "Capture System
/// Traffic" does). Previous settings are restored when the app exits. Safe
/// without a trusted CA: HTTPS is blind-tunneled until the CA is installed,
/// so nothing breaks.
#[tauri::command]
#[specta::specta]
pub async fn proxy_set_system(enabled: bool) -> Result<(), ProxyError> {
    let result = if enabled {
        crate::system_proxy::enable("127.0.0.1:8080")
    } else {
        crate::system_proxy::disable()
    };
    result.map_err(|message| ProxyError::Io { message })
}

/// Lazily fetches the captured request/response bodies of one exchange
/// (BRD: heavy payloads load only when the row is opened).
#[tauri::command]
#[specta::specta]
pub fn traffic_body(
    store: State<'_, crate::proxy::SharedStore>,
    id: u64,
) -> Option<crate::proxy::BodyText> {
    store.lock().unwrap().get(id)
}
