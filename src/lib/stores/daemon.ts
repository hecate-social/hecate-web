///
/// Daemon connection store — polling pattern.
///
/// Polls /api/health to track daemon state.
/// During boot: 500ms interval (matches daemon's boot tracker poll).
/// Once ready: 5000ms interval.
///
import { writable, derived } from 'svelte/store';
import { get as apiGet } from '$lib/api';
import type { DaemonHealth, ConnectionStatus } from '../types.js';
import { emptyViewstate, type Viewstate } from '$lib/viewstate';

const POLL_INTERVAL_READY_MS = 5000;
const POLL_INTERVAL_BOOT_MS = 500;

// --- Raw state ---

export const health = writable<DaemonHealth | null>(null);
export const connectionStatus = writable<ConnectionStatus>('connecting');
export const unavailableSince = writable<number | null>(null);

// --- Checklist derivations (read by UI) ---

export const isConnected = derived(connectionStatus, ($s) => $s === 'connected');
export const isReady = derived(health, ($h) => $h?.ready === true);
export const isStarting = derived(
	[connectionStatus, health],
	([$conn, $h]) => $conn === 'connected' && $h !== null && !$h.ready
);
export const isUnavailable = derived(connectionStatus, ($s) => $s === 'error');

/// Viewstate — daemon-computed presentation state for all UI regions.
/// Falls back to emptyViewstate when health hasn't arrived yet.
export const viewstate = derived<typeof health, Viewstate>(
	health,
	($h) => $h?.viewstate ?? emptyViewstate
);
export const showOverlay = derived(
	[connectionStatus, health],
	([$conn, $h]) => $conn !== 'connected' || $h === null || !$h.ready
);

// --- Heartbeat handler ---

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let onReconnectCallback: (() => void) | null = null;

export function onReconnect(cb: () => void): void {
	onReconnectCallback = cb;
}

function handleHealthPayload(payload: DaemonHealth | null) {
	if (payload && typeof payload === 'object' && 'status' in payload) {
		const wasDisconnected = getCurrentValue(connectionStatus) !== 'connected';
		health.set(payload);
		connectionStatus.set('connected');
		unavailableSince.set(null);
		if (wasDisconnected && onReconnectCallback) {
			onReconnectCallback();
		}
	} else {
		health.set(null);
		connectionStatus.set('error');
		if (getCurrentValue(unavailableSince) === null) {
			unavailableSince.set(Date.now());
		}
	}
}

async function pollHealth(): Promise<void> {
	try {
		const data = await apiGet<DaemonHealth>('/health');
		handleHealthPayload(data);
	} catch {
		handleHealthPayload(null);
	}
}

// --- Lifecycle ---

export async function startPolling(): Promise<void> {
	stopPolling();
	await pollHealth();
	schedulePoll();
}

function schedulePoll(): void {
	const h = getCurrentValue(health);
	const interval = h?.ready ? POLL_INTERVAL_READY_MS : POLL_INTERVAL_BOOT_MS;
	pollTimer = setTimeout(async () => {
		await pollHealth();
		schedulePoll();
	}, interval);
}

export function stopPolling(): void {
	if (pollTimer) {
		clearTimeout(pollTimer);
		pollTimer = null;
	}
}

// --- Helpers ---

function getCurrentValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
	let value: T;
	store.subscribe((v) => (value = v))();
	return value!;
}
