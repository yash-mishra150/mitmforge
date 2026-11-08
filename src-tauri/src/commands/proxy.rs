//! IPC adapter for the proxy engine.

use crate::{PROXY_EVENT, ProxyError};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter};

/// Starts the proxy engine once; traffic streams to the UI as `ProxyEvent`s.
/// Called from the frontend *after* the event listener is attached, so early
/// traffic is not lost. shortcut: if the engine dies, restarting needs an app
/// relaunch (STARTED never resets); a lifecycle command set fixes that later.
#[tauri::command]
#[specta::specta]
pub async fn proxy_start(app: AppHandle) -> Result<(), ProxyError> {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return Err(ProxyError::AlreadyRunning);
    }
    let sink: Arc<dyn Fn(crate::proxy::ProxyEvent) + Send + Sync> = Arc::new(move |event| {
        if let Err(e) = app.emit(PROXY_EVENT, &event) {
            eprintln!("emit proxy event failed: {e}");
        }
    });
    tauri::async_runtime::spawn(async move {
        let addr = "127.0.0.1:8080".parse().unwrap();
        if let Err(e) = crate::proxy::start(sink, addr).await {
            eprintln!("proxy engine stopped: {e}");
        }
    });
    Ok(())
}
