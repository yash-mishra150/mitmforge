//! Windows system proxy control (HKCU Internet Settings + WinINet refresh).
//! What Proxyman's "Capture System Traffic" does: every proxy-aware app
//! (browsers, Node, curl, Electron...) starts routing through us. Previous
//! settings are restored when we set them and the app exits.

#[cfg(windows)]
mod imp {
    use std::sync::Mutex;

    const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    const SETTINGS_CHANGED: u32 = 39; // INTERNET_OPTION_SETTINGS_CHANGED
    const REFRESH: u32 = 37; // INTERNET_OPTION_REFRESH

    /// The proxy settings that existed before we enabled ours, and whether we
    /// are the ones who enabled it (restored on app exit).
    static SAVED: Mutex<Option<(u32, Option<String>)>> = Mutex::new(None);

    fn open() -> Result<winreg::RegKey, String> {
        let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        hkcu.open_subkey_with_flags(KEY, winreg::enums::KEY_READ | winreg::enums::KEY_WRITE)
            .map_err(|e| format!("open Internet Settings: {e}"))
    }

    fn refresh() {
        // SAFETY: no handle, options take no buffers; notify WinINet consumers
        // (browsers) so the change applies live, without app restarts.
        unsafe {
            winapi::um::wininet::InternetSetOptionW(
                std::ptr::null_mut(),
                SETTINGS_CHANGED,
                std::ptr::null_mut(),
                0,
            );
            winapi::um::wininet::InternetSetOptionW(
                std::ptr::null_mut(),
                REFRESH,
                std::ptr::null_mut(),
                0,
            );
        }
    }

    /// `Some(enabled)` from the registry; `None` if it cannot be read.
    pub fn current() -> Option<bool> {
        let key = open().ok()?;
        key.get_value::<u32, _>("ProxyEnable").ok().map(|n| n != 0)
    }

    pub fn enable(server: &str) -> Result<(), String> {
        let key = open()?;
        let mut saved = SAVED.lock().unwrap();
        if saved.is_none() {
            let prev_enable = key.get_value::<u32, _>("ProxyEnable").unwrap_or(0);
            let prev_server = key.get_value("ProxyServer").ok();
            *saved = Some((prev_enable, prev_server));
        }
        key.set_value("ProxyEnable", &1u32)
            .map_err(|e| format!("set ProxyEnable: {e}"))?;
        key.set_value("ProxyServer", &server.to_string())
            .map_err(|e| format!("set ProxyServer: {e}"))?;
        drop(saved);
        refresh();
        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        let key = open()?;
        key.set_value("ProxyEnable", &0u32)
            .map_err(|e| format!("set ProxyEnable: {e}"))?;
        refresh();
        Ok(())
    }

    /// Restores the pre-MitmForge settings if we enabled the proxy and it is
    /// still pointing at us. Called on app exit.
    pub fn restore_on_exit() {
        let mut saved = SAVED.lock().unwrap();
        let Some((prev_enable, prev_server)) = saved.take() else {
            return;
        };
        let Ok(key) = open() else { return };
        // Only restore if the registry still holds our server; the user may
        // have changed the proxy themselves meanwhile.
        if prev_server.is_some()
            && key.get_value::<String, _>("ProxyServer").ok().as_deref() != Some("127.0.0.1:8080")
        {
            return;
        }
        let _ = key.set_value("ProxyEnable", &prev_enable);
        if let Some(server) = prev_server {
            let _ = key.set_value("ProxyServer", &server);
        }
        drop(saved);
        refresh();
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn current() -> Option<bool> {
        None
    }
    pub fn enable(_server: &str) -> Result<(), String> {
        Err("system proxy control is Windows-only for now".into())
    }
    pub fn disable() -> Result<(), String> {
        Err("system proxy control is Windows-only for now".into())
    }
    pub fn restore_on_exit() {}
}

pub use imp::*;
