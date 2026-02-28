import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { DaemonHealth, ConnectionStatus } from '../types.js';

export const health = writable<DaemonHealth | null>(null);
export const connectionStatus = writable<ConnectionStatus>('connecting');
export const lastError = writable<string | null>(null);
export const unavailableSince = writable<number | null>(null);
/** Diagnostic: last error detail visible on the overlay */
export const debugError = writable<string>('');

export const isConnected = derived(connectionStatus, ($s) => $s === 'connected');
export const isHealthy = derived(health, ($h) => $h?.status === 'healthy' && $h?.ready === true);
export const isStarting = derived(health, ($h) => $h?.status === 'starting' || ($h !== null && !$h.ready));
export const isUnavailable = derived(connectionStatus, ($s) => $s === 'error');
export const showOverlay = derived(
	[isStarting, isUnavailable],
	([$starting, $unavailable]) => $starting || $unavailable
);

const POLL_INTERVAL = 3_000;

let healthTimer: ReturnType<typeof setInterval> | null = null;
let onReconnectCallback: (() => void) | null = null;

/** Register a callback that fires when transitioning from disconnected to connected. */
export function onReconnect(cb: () => void): void {
	onReconnectCallback = cb;
}

function handleHealthEvent(payload: DaemonHealth | null) {
	if (payload && typeof payload === 'object' && 'status' in payload) {
		const wasDisconnected = get_connectionStatus() !== 'connected';
		health.set(payload);
		connectionStatus.set('connected');
		lastError.set(null);
		unavailableSince.set(null);
		debugError.set('');
		if (wasDisconnected && onReconnectCallback) {
			onReconnectCallback();
		}
	} else {
		health.set(null);
		connectionStatus.set('error');
		if (get_unavailableSince() === null) {
			unavailableSince.set(Date.now());
		}
	}
}

function get_unavailableSince(): number | null {
	let value: number | null = null;
	unavailableSince.subscribe((v) => (value = v))();
	return value;
}

function get_connectionStatus(): ConnectionStatus {
	let value: ConnectionStatus = 'connecting';
	connectionStatus.subscribe((v) => (value = v))();
	return value;
}

/**
 * Read cached health from the Rust watcher.
 * The watcher thread maintains the cache via inotify + periodic health checks.
 * This invoke just reads an in-memory Mutex — no socket I/O.
 */
export async function fetchHealth(): Promise<void> {
	try {
		const h = await invoke<DaemonHealth | null>('get_cached_health');
		handleHealthEvent(h);
	} catch (e) {
		debugError.set(`cache read failed: ${e}`);
		handleHealthEvent(null);
	}
}

export async function startPolling(): Promise<void> {
	stopPolling();
	healthTimer = setInterval(fetchHealth, POLL_INTERVAL);
	await fetchHealth();
}

export function stopPolling(): void {
	if (healthTimer) {
		clearInterval(healthTimer);
		healthTimer = null;
	}
}
