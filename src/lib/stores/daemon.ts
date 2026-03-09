///
/// Daemon connection store — polling pattern.
///
/// Polls /api/health every few seconds to track daemon state.
/// Progression: connecting → starting → ready
///
import { writable, derived } from 'svelte/store';
import { get as apiGet } from '$lib/api';
import type { DaemonHealth, ConnectionStatus } from '../types.js';

const POLL_INTERVAL_MS = 5000;

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
export const showOverlay = derived(
	[connectionStatus, health],
	([$conn, $h]) => $conn !== 'connected' || $h === null || !$h.ready
);

// --- Heartbeat handler ---

let pollTimer: ReturnType<typeof setInterval> | null = null;
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
	pollTimer = setInterval(pollHealth, POLL_INTERVAL_MS);
}

export function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

// --- Helpers ---

function getCurrentValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
	let value: T;
	store.subscribe((v) => (value = v))();
	return value!;
}
