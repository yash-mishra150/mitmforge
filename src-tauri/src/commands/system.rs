//! System monitoring commands (CPU, memory, disk, etc.)

use serde::{Deserialize, Serialize};
use specta::Type;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

/// System metrics returned to the frontend.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct SystemMetrics {
    /// Total system memory in bytes.
    pub total_memory: u64,
    /// Used system memory in bytes.
    pub used_memory: u64,
    /// Total swap memory in bytes.
    pub total_swap: u64,
    /// Used swap memory in bytes.
    pub used_swap: u64,
    /// CPU usage percentage (0.0 - 100.0).
    pub cpu_usage: f32,
    /// Per-CPU usage percentages.
    pub cpu_per_core: Vec<f32>,
    /// Process CPU usage percentage.
    pub process_cpu_usage: f32,
    /// Process memory usage in bytes.
    pub process_memory: u64,
    /// Uptime in seconds.
    pub uptime: u64,
}

/// Returns current system metrics.
#[tauri::command]
#[specta::specta]
pub fn system_metrics() -> SystemMetrics {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

    // First refresh to get initial CPU readings
    sys.refresh_cpu();
    sys.refresh_memory();

    // Wait a bit for CPU measurement
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_cpu();

    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let total_swap = sys.total_swap();
    let used_swap = sys.used_swap();

    let cpu_usage = sys.global_cpu_info().cpu_usage();
    let cpu_per_core: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();

    // Process-specific metrics
    let current_pid = std::process::id();
    let process_cpu_usage = sys
        .process(sysinfo::Pid::from_u32(current_pid))
        .map(|p| p.cpu_usage())
        .unwrap_or(0.0);
    let process_memory = sys
        .process(sysinfo::Pid::from_u32(current_pid))
        .map(|p| p.memory())
        .unwrap_or(0);

    let uptime = sysinfo::System::uptime();

    SystemMetrics {
        total_memory,
        used_memory,
        total_swap,
        used_swap,
        cpu_usage,
        cpu_per_core,
        process_cpu_usage,
        process_memory,
        uptime,
    }
}