use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

static TX_BYTES: AtomicU64 = AtomicU64::new(0);
static RX_BYTES: AtomicU64 = AtomicU64::new(0);
static TX_COUNT: AtomicU64 = AtomicU64::new(0);
static RX_COUNT: AtomicU64 = AtomicU64::new(0);

pub fn record_tx(bytes: u64) {
    TX_BYTES.fetch_add(bytes, Ordering::Relaxed);
    TX_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn record_rx(bytes: u64) {
    RX_BYTES.fetch_add(bytes, Ordering::Relaxed);
    RX_COUNT.fetch_add(1, Ordering::Relaxed);
}

#[derive(Serialize)]
pub struct TrafficCounters {
    pub tx_bytes: u64,
    pub rx_bytes: u64,
    pub tx_count: u64,
    pub rx_count: u64,
}

#[tauri::command]
pub fn get_traffic_counters() -> TrafficCounters {
    TrafficCounters {
        tx_bytes: TX_BYTES.load(Ordering::Relaxed),
        rx_bytes: RX_BYTES.load(Ordering::Relaxed),
        tx_count: TX_COUNT.load(Ordering::Relaxed),
        rx_count: RX_COUNT.load(Ordering::Relaxed),
    }
}
