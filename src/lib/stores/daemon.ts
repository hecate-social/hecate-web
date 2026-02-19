import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DaemonHealth, ConnectionStatus, LLMHealth } from '../types.js';
import * as api from '../api.js';

export const health = writable<DaemonHealth | null>(null);
export const llmHealth = writable<LLMHealth | null>(null);
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

const POLL_INTERVAL = 30_000;

let unlisten: UnlistenFn | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let llmTimer: ReturnType<typeof setInterval> | null = null;
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

export async function fetchLLMHealth(): Promise<void> {
	try {
		const h = await api.get<LLMHealth>('/api/llm/health');
		llmHealth.set(h);
	} catch {
		llmHealth.set(null);
	}
}

export async function startPolling(): Promise<void> {
	stopPolling();

	// Listen for daemon-health events from the Rust watcher (inotify)
	unlisten = await listen<DaemonHealth | null>('daemon-health', (event) => {
		handleHealthEvent(event.payload);
	});

	// Immediate check — the watcher's initial emit fires before this listener is ready
	await fetchHealth();

	// Periodic daemon health poll as fallback (30s, the watcher handles instant detection)
	healthTimer = setInterval(fetchHealth, POLL_INTERVAL);

	// LLM health polls on same cadence (only when connected)
	llmTimer = setInterval(() => {
		if (get_connectionStatus() === 'connected') {
			fetchLLMHealth();
		}
	}, POLL_INTERVAL);
	fetchLLMHealth();
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
	if (llmTimer) {
		clearInterval(llmTimer);
		llmTimer = null;
	}
}
