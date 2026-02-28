import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DaemonHealth, ConnectionStatus } from '../types.js';

export const health = writable<DaemonHealth | null>(null);
export const connectionStatus = writable<ConnectionStatus>('connecting');
export const lastError = writable<string | null>(null);
export const unavailableSince = writable<number | null>(null);

export const isConnected = derived(connectionStatus, ($s) => $s === 'connected');
export const isHealthy = derived(health, ($h) => $h?.status === 'healthy' && $h?.ready === true);
export const isStarting = derived(health, ($h) => $h?.status === 'starting' || ($h !== null && !$h.ready));
export const isUnavailable = derived(connectionStatus, ($s) => $s === 'error');
export const showOverlay = derived(
	[isStarting, isUnavailable],
	([$starting, $unavailable]) => $starting || $unavailable
);

let unlisten: UnlistenFn | null = null;
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

/** On-demand refresh — triggers a single health check via invoke */
export async function fetchHealth(): Promise<void> {
	try {
		const h = await invoke<DaemonHealth>('check_daemon_health');
		handleHealthEvent(h);
	} catch {
		handleHealthEvent(null);
	}
}

export async function startPolling(): Promise<void> {
	stopPolling();

	// Listen for daemon-health events from the Rust watcher (inotify + 30s periodic recheck).
	// The watcher is the single source of truth for daemon connection state.
	// No JS-side timer — the Rust watcher thread already does periodic rechecks and instant
	// inotify detection. A redundant JS timer creates race conditions where an invoke failure
	// can override the watcher's 'connected' state with 'error'.
	unlisten = await listen<DaemonHealth | null>('daemon-health', (event) => {
		handleHealthEvent(event.payload);
	});

	// Immediate check — the watcher's initial emit fires before this listener is ready
	await fetchHealth();
}

function get_connectionStatus(): ConnectionStatus {
	let value: ConnectionStatus = 'connecting';
	connectionStatus.subscribe((v) => (value = v))();
	return value;
}

export function stopPolling(): void {
	if (unlisten) {
		unlisten();
		unlisten = null;
	}
}
