import { writable, derived } from 'svelte/store';
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

/** Health check via the hecate:// custom protocol (fetch-based).
 *  This bypasses Tauri's invoke IPC entirely and uses the URI scheme
 *  protocol handler which proxies to the daemon Unix socket. */
export async function fetchHealth(): Promise<void> {
	try {
		const resp = await fetch('hecate://localhost/health');
		if (!resp.ok) {
			handleHealthEvent(null);
			return;
		}
		const h: DaemonHealth = await resp.json();
		handleHealthEvent(h);
	} catch {
		handleHealthEvent(null);
	}
}

export async function startPolling(): Promise<void> {
	stopPolling();

	// Always poll via fetch against the hecate:// custom protocol.
	// This uses the URI scheme handler (proven to work on WebKitGTK)
	// instead of Tauri's invoke IPC (which may not work reliably).
	healthTimer = setInterval(fetchHealth, POLL_INTERVAL);

	// Also listen for daemon-health events from the Rust watcher as a bonus.
	try {
		unlisten = await listen<DaemonHealth | null>('daemon-health', (event) => {
			handleHealthEvent(event.payload);
		});
	} catch {
		// listen may fail on some platforms — not critical
	}

	// Immediate check — don't wait for the first timer tick.
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
