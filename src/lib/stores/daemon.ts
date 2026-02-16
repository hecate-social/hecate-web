import { writable, derived } from 'svelte/store';
import type { DaemonHealth, ConnectionStatus, LLMHealth } from '../types.js';
import * as api from '../api.js';

export const health = writable<DaemonHealth | null>(null);
export const llmHealth = writable<LLMHealth | null>(null);
export const connectionStatus = writable<ConnectionStatus>('connecting');
export const lastError = writable<string | null>(null);

export const isConnected = derived(connectionStatus, ($s) => $s === 'connected');
export const isHealthy = derived(health, ($h) => $h?.status === 'healthy' && $h?.ready === true);
export const isStarting = derived(health, ($h) => $h?.status === 'starting' || ($h !== null && !$h.ready));

let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function fetchHealth(): Promise<void> {
	try {
		const h = await api.get<DaemonHealth>('/health');
		health.set(h);
		connectionStatus.set('connected');
		lastError.set(null);
	} catch (e) {
		connectionStatus.set('error');
		lastError.set(e instanceof Error ? e.message : String(e));
		health.set(null);
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

export function startPolling(intervalMs = 10000): void {
	stopPolling();
	fetchHealth();
	fetchLLMHealth();
	pollTimer = setInterval(() => {
		fetchHealth();
		fetchLLMHealth();
	}, intervalMs);
}

export function stopPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}
