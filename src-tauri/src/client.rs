//! Attribute a captured client↔proxy socket pair to the local process that
//! made it (Proxyman-style "Apps").
//!
//! Windows: scans the owner-module extended TCP table for the row whose
//! local end is `client_addr` and remote end is `proxy_addr`, takes
//! `dwOwningPid`, and resolves it to an image name (file name only).
//! Non-Windows: stub returning `None`. Never panics.

use std::net::SocketAddr;

pub fn process_name(client_addr: SocketAddr, proxy_addr: SocketAddr) -> Option<String> {
    #[cfg(windows)]
    {
        windows_impl::process_name(client_addr, proxy_addr)
    }
    #[cfg(not(windows))]
    {
        return stub::process_name(client_addr, proxy_addr);
    }
}

#[cfg(windows)]
mod windows_impl {
    use std::collections::HashMap;
    use std::net::{IpAddr, SocketAddr};
    use std::path::Path;
    use std::sync::{LazyLock, Mutex};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Foundation::NO_ERROR;
    use windows_sys::Win32::NetworkManagement::IpHelper::GetExtendedTcpTable;
    use windows_sys::Win32::NetworkManagement::IpHelper::MIB_TCPROW_OWNER_MODULE;
    use windows_sys::Win32::NetworkManagement::IpHelper::TCP_TABLE_OWNER_MODULE_CONNECTIONS;
    use windows_sys::Win32::Networking::WinSock::AF_INET;
    use windows_sys::Win32::System::Threading::OpenProcess;
    use windows_sys::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION;
    use windows_sys::Win32::System::Threading::QueryFullProcessImageNameW;

    static CACHE: LazyLock<Mutex<HashMap<u32, String>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));

    /// Manual ntohs: network-byte-order u16 → host u16.
    fn ntohs(port: u16) -> u16 {
        ((port & 0x00FF) << 8) | ((port & 0xFF00) >> 8)
    }

    fn pid_name(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h == 0 {
                return None;
            }
            let mut size: u32 = 4096;
            let mut buf: Vec<u16> = vec![0; size as usize];
            let ret = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
            let _ = CloseHandle(h);
            if ret == 0 {
                return None;
            }
            let name = String::from_utf16_lossy(&buf[..size as usize]);
            Path::new(&name)
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_owned())
        }
    }

    fn cached_pid_name(pid: u32) -> Option<String> {
        if let Some(name) = CACHE.lock().unwrap().get(&pid).cloned() {
            return Some(name);
        }
        let name = pid_name(pid);
        if let Some(ref n) = name {
            CACHE.lock().unwrap().insert(pid, n.clone());
        }
        name
    }

    pub(super) fn process_name(client_addr: SocketAddr, proxy_addr: SocketAddr) -> Option<String> {
        let client_ip = match client_addr.ip() {
            IpAddr::V4(v) => u32::from_be_bytes(v.octets()),
            IpAddr::V6(_) => return None,
        };
        let proxy_ip = match proxy_addr.ip() {
            IpAddr::V4(v) => u32::from_be_bytes(v.octets()),
            IpAddr::V6(_) => return None,
        };

        let mut size: u32 = 0;
        unsafe {
            let _ = GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut size,
                0,
                AF_INET as u32,
                TCP_TABLE_OWNER_MODULE_CONNECTIONS,
                0,
            );
        }
        if size == 0 {
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        unsafe {
            let ret = GetExtendedTcpTable(
                buf.as_mut_ptr() as *mut _,
                &mut size,
                0,
                AF_INET as u32,
                TCP_TABLE_OWNER_MODULE_CONNECTIONS,
                0,
            );
            if ret != NO_ERROR {
                return None;
            }
        }

        let num = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
        let row_align = std::mem::align_of::<MIB_TCPROW_OWNER_MODULE>();
        let header_size = std::mem::size_of::<u32>();
        let table_offset = (header_size + row_align - 1) & !(row_align - 1);
        let row_size = std::mem::size_of::<MIB_TCPROW_OWNER_MODULE>();
        if buf.len() < table_offset + num.saturating_mul(row_size) {
            return None;
        }
        let rows = unsafe {
            std::slice::from_raw_parts(
                buf.as_ptr().add(table_offset) as *const MIB_TCPROW_OWNER_MODULE,
                num,
            )
        };

        for row in rows {
            if u32::from_be(row.dwLocalAddr) == client_ip
                && ntohs(row.dwLocalPort as u16) == client_addr.port()
                && u32::from_be(row.dwRemoteAddr) == proxy_ip
                && ntohs(row.dwRemotePort as u16) == proxy_addr.port()
            {
                return cached_pid_name(row.dwOwningPid);
            }
        }
        None
    }
}

#[cfg(not(windows))]
mod stub {
    use std::net::SocketAddr;

    pub(super) fn process_name(
        _client_addr: SocketAddr,
        _proxy_addr: SocketAddr,
    ) -> Option<String> {
        None
    }
}
