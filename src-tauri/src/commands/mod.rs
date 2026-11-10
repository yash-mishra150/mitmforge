//! IPC surface: thin typed adapters; no domain logic here.

pub mod proxy;

use crate::proxy::ProxyEvent;
use tauri_specta::collect_commands;

/// Builds the tauri-specta builder holding every command and exported type.
/// Also used by `export_bindings` (tests) to regenerate `src/bindings.ts`.
pub fn builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            proxy::proxy_start,
            proxy::proxy_status,
            proxy::proxy_install_ca,
            proxy::proxy_set_system,
            proxy::traffic_body,
            proxy::traffic_recording,
            proxy::traffic_autosave,
        ])
        .typ::<ProxyEvent>()
        .dangerously_cast_bigints_to_number()
}
