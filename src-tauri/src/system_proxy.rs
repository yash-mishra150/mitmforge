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
    type SavedSettings = (u32, Option<String>, Option<String>);
    static SAVED: Mutex<Option<SavedSettings>> = Mutex::new(None);

    fn open() -> Result<winreg::RegKey, String> {
        let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        hkcu.open_subkey_with_flags(KEY, winreg::enums::KEY_READ | winreg::enums::KEY_WRITE)
            .map_err(|e| format!("open Internet Settings: {e}"))
    }

    /// True when our Root CA is present in the user store. Checked once per
    /// launch and cached (certutil costs ~200ms); `mark_ca_installed` updates
    /// the cache when Trust CA succeeds. shortcut: uninstalling the CA by hand
    /// is only noticed on the next app launch.
    static CA_TRUSTED: Mutex<Option<bool>> = Mutex::new(None);

    pub fn ca_trusted() -> bool {
        let mut cached = CA_TRUSTED.lock().unwrap();
        if let Some(trusted) = *cached {
            return trusted;
        }
        let trusted = std::process::Command::new("certutil")
            .args(["-user", "-store", "Root"])
            .output()
            .map(|out| String::from_utf8_lossy(&out.stdout).contains("MitmForge Root CA"))
            .unwrap_or(false);
        *cached = Some(trusted);
        trusted
    }

    pub fn mark_ca_installed() {
        *CA_TRUSTED.lock().unwrap() = Some(true);
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
            let prev_server = key.get_value::<String, _>("ProxyServer").ok();
            let prev_override = key.get_value::<String, _>("ProxyOverride").ok();
            // A previous session that crashed while capturing leaves our own
            // proxy in the registry; that is not a real prior state — treat
            // it as "off" so closing the app always un-breaks browsing.
            let prev_is_ours = prev_enable != 0 && prev_server.as_deref() == Some("127.0.0.1:8080");
            *saved = if prev_is_ours {
                Some((0, None, prev_override))
            } else {
                Some((prev_enable, prev_server, prev_override))
            };
        }
        key.set_value("ProxyEnable", &1u32)
            .map_err(|e| format!("set ProxyEnable: {e}"))?;
        key.set_value("ProxyServer", &server.to_string())
            .map_err(|e| format!("set ProxyServer: {e}"))?;
        // Keep local traffic out of the proxy: an empty bypass list routes
        // even localhost dev servers (including our own webview) through us.
        // (`saved` already guards SAVED — std Mutex is not reentrant.)
        let prev_override = saved.as_ref().and_then(|s| s.2.clone());
        let mut entries: Vec<String> = prev_override
            .unwrap_or_default()
            .split(';')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        for bypass in ["localhost", "127.0.0.1", "<local>"] {
            if !entries.iter().any(|e| e.eq_ignore_ascii_case(bypass)) {
                entries.push(bypass.to_string());
            }
        }
        key.set_value("ProxyOverride", &entries.join(";"))
            .map_err(|e| format!("set ProxyOverride: {e}"))?;
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
        let Some((prev_enable, prev_server, prev_override)) = saved.take() else {
            return;
        };
        let Ok(key) = open() else { return };
        // Only restore if the registry still holds our server; the user may
        // have changed the proxy themselves meanwhile.
        if key.get_value::<String, _>("ProxyServer").ok().as_deref() != Some("127.0.0.1:8080") {
            return;
        }
        let _ = key.set_value("ProxyEnable", &prev_enable);
        if let Some(server) = prev_server {
            let _ = key.set_value("ProxyServer", &server);
        }
        if let Some(override_list) = prev_override {
            let _ = key.set_value("ProxyOverride", &override_list);
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
    pub fn ca_trusted() -> bool {
        false
    }
    pub fn mark_ca_installed() {}
    pub fn enable(_server: &str) -> Result<(), String> {
        Err("system proxy control is Windows-only for now".into())
    }
    pub fn disable() -> Result<(), String> {
        Err("system proxy control is Windows-only for now".into())
    }
    pub fn restore_on_exit() {}
}

pub use imp::*;
