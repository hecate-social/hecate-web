import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DaemonHealth, ConnectionStatus } from '../types.js';

export const health = writable<DaemonHealth | null>(null);
export const connectionStatus = writable<ConnectionStatus>('connecting');
export const lastError = writable<string | null>(null);
export const unavailableSince = writable<number | null>(null);
/** Diagnostic: last error detail visible on the overlay */
export const debugError = writable<string>('(no fetch attempted yet)');

export const isConnected = derived(connectionStatus, ($s) => $s === 'connected');
export const isHealthy = derived(health, ($h) => $h?.status === 'healthy' && $h?.ready === true);
export const isStarting = derived(health, ($h) => $h?.status === 'starting' || ($h !== null && !$h.ready));
export const isUnavailable = derived(connectionStatus, ($s) => $s === 'error');
export const showOverlay = derived(
	[isStarting, isUnavailable],
	([$starting, $unavailable]) => $starting || $unavailable
);

const POLL_INTERVAL = 5_000;

let unlisten: UnlistenFn | null = null;
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

/** Try all three health check paths and use whichever works first. */
export async function fetchHealth(): Promise<void> {
	// Path 1: fetch via hecate:// custom protocol
	try {
		const resp = await fetch('hecate://localhost/health');
		if (resp.ok) {
			const h: DaemonHealth = await resp.json();
			handleHealthEvent(h);
			return;
		}
		debugError.set(`fetch: HTTP ${resp.status}`);
	} catch (e) {
		debugError.set(`fetch: ${e}`);
	}

	// Path 2: invoke Tauri command
	try {
		const h = await invoke<DaemonHealth>('check_daemon_health');
		handleHealthEvent(h);
		return;
	} catch (e) {
		debugError.update((prev) => `${prev} | invoke: ${e}`);
	}

	// Both failed
	handleHealthEvent(null);
}

export async function startPolling(): Promise<void> {
	stopPolling();
	debugError.set('startPolling called');

	// Always poll — timer runs continuously and never stops.
	healthTimer = setInterval(fetchHealth, POLL_INTERVAL);

	// Also listen for daemon-health events from the Rust watcher as a bonus.
	try {
		unlisten = await listen<DaemonHealth | null>('daemon-health', (event) => {
			handleHealthEvent(event.payload);
		});
	} catch {
		// listen may fail on some platforms — not critical
	}

	// Immediate check.
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
	if (healthTimer) {
		clearInterval(healthTimer);
		healthTimer = null;
	}
}
