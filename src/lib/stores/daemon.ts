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

const POLL_INTERVAL = 5_000;

let unlisten: UnlistenFn | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let onReconnectCallback: (() => void) | null = null;

/** Register a callback that fires when transitioning from disconnected to connected. */
export function onReconnect(cb: () => void): void {
	onReconnectCallback = cb;
}

function handleHealthEvent(payload: DaemonHealth | null, source: string) {
	if (payload && typeof payload === 'object' && 'status' in payload) {
		const wasDisconnected = get_connectionStatus() !== 'connected';
		health.set(payload);
		connectionStatus.set('connected');
		lastError.set(null);
		unavailableSince.set(null);
		if (wasDisconnected) {
			console.error(`[daemon.ts] connected via ${source}: status=${payload.status} ready=${payload.ready}`);
			if (onReconnectCallback) {
				onReconnectCallback();
			}
		}
	} else {
		const wasConnected = get_connectionStatus() === 'connected';
		health.set(null);
		connectionStatus.set('error');
		if (get_unavailableSince() === null) {
			unavailableSince.set(Date.now());
		}
		if (wasConnected) {
			console.error(`[daemon.ts] disconnected via ${source}: payload=${JSON.stringify(payload)}`);
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
		handleHealthEvent(h, 'invoke');
	} catch (e) {
		console.error(`[daemon.ts] invoke failed: ${e}`);
		handleHealthEvent(null, 'invoke');
	}
}

export async function startPolling(): Promise<void> {
	stopPolling();

	// Primary: always poll via invoke — this is reliable on all platforms.
	// The timer runs continuously and never stops.
	healthTimer = setInterval(fetchHealth, POLL_INTERVAL);

	// Bonus: also listen for daemon-health events from the Rust watcher.
	// On WebKitGTK, app.emit() from Rust threads may not reach JS listeners,
	// but when it works, it gives faster updates than the 5s poll interval.
	try {
		unlisten = await listen<DaemonHealth | null>('daemon-health', (event) => {
			handleHealthEvent(event.payload, 'listen');
		});
	} catch (e) {
		console.error(`[daemon.ts] listen setup failed: ${e}`);
	}

	// Immediate check — don't wait for the first timer tick.
	await fetchHealth();
	console.error(`[daemon.ts] startPolling complete, timer running every ${POLL_INTERVAL}ms`);
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
