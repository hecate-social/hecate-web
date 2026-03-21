// Observer: System overview + SSE metrics stream

import { writable } from 'svelte/store';
import { get } from '$lib/api';
import { isTauri } from '$lib/tauri';

const BASE = isTauri() && !import.meta.env.DEV ? 'hecate://localhost' : '';

export interface SystemOverview {
	memory: Record<string, number>;
	processes: { count: number; limit: number };
	schedulers: { total: number; online: number };
	atoms: { count: number; limit: number };
	ports: { count: number; limit: number };
	uptime_ms: number;
	otp_release: string;
	erts_version: string;
	boot_phase: string;
	pg_groups: Array<{ name: string; member_count: number }>;
}

export interface MetricsSnapshot {
	memory: Record<string, number>;
	process_count: number;
	scheduler_utilization: Array<{ scheduler: number; utilization: number }>;
	reductions_delta: number;
	io_delta: { input_bytes: number; output_bytes: number };
	timestamp: number;
}

export const systemOverview = writable<SystemOverview | null>(null);
export const metricsHistory = writable<MetricsSnapshot[]>([]);

export async function fetchSystemOverview(): Promise<SystemOverview> {
	const data = await get<{ ok: boolean } & SystemOverview>('/api/observer/system');
	systemOverview.set(data);
	return data;
}

// --- SSE Metrics Stream ---

let metricsSource: EventSource | null = null;
const MAX_HISTORY = 60;

export function startMetricsStream(): void {
	if (metricsSource) return;
	metricsSource = new EventSource(`${BASE}/api/observer/metrics/stream`);
	metricsSource.addEventListener('metrics', (e: Event) => {
		const me = e as MessageEvent;
		try {
			const snapshot: MetricsSnapshot = JSON.parse(me.data);
			metricsHistory.update((h) => {
				const next = [...h, snapshot];
				return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
			});
		} catch { /* ignore */ }
	});
	metricsSource.onerror = () => { stopMetricsStream(); };
}

export function stopMetricsStream(): void {
	if (metricsSource) { metricsSource.close(); metricsSource = null; }
}
