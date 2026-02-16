import { writable, derived, get } from 'svelte/store';
import type { DaemonHealth, ConnectionStatus, LLMHealth } from '../types.js';
import * as api from '../api.js';

const POLL_FAST_MS = 2000;
const POLL_SLOW_MS = 10000;

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

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentInterval = POLL_FAST_MS;

export async function fetchHealth(): Promise<void> {
	try {
		const h = await api.get<DaemonHealth>('/health');
		health.set(h);
		connectionStatus.set('connected');
		lastError.set(null);
		unavailableSince.set(null);
		reschedule(POLL_SLOW_MS);
	} catch (e) {
		connectionStatus.set('error');
		lastError.set(e instanceof Error ? e.message : String(e));
		health.set(null);
		if (get(unavailableSince) === null) {
			unavailableSince.set(Date.now());
		}
		reschedule(POLL_FAST_MS);
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

function reschedule(intervalMs: number): void {
	if (intervalMs === currentInterval) return;
	currentInterval = intervalMs;
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = setInterval(poll, currentInterval);
	}
}

function poll(): void {
	fetchHealth();
	fetchLLMHealth();
}

export function startPolling(): void {
	stopPolling();
	currentInterval = POLL_FAST_MS;
	poll();
	pollTimer = setInterval(poll, currentInterval);
}

export function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}
