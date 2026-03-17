// Observer data store — polling + SSE for BEAM introspection.
//
// Each page fetches on mount and optionally auto-refreshes.
// SSE metrics stream connects only when system overview is visible.

import { writable } from 'svelte/store';
import { get } from '$lib/api';
import { isTauri } from '$lib/tauri';

const BASE = isTauri() && !import.meta.env.DEV ? 'hecate://localhost' : '';

// --- Types ---

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

export interface ProcessInfo {
	pid: string;
	registered_name: string | null;
	initial_call: string | null;
	current_function: string | null;
	memory: number;
	reductions: number;
	message_queue_len: number;
	status: string;
}

export interface ProcessDetail extends ProcessInfo {
	links: string[];
	monitors: Array<{ type: string; target: string }>;
	trap_exit: boolean;
	heap_size: number;
	stack_size: number;
	total_heap_size: number;
	dictionary: Array<{ key: string; value: string }>;
	dictionary_size: number;
	garbage_collection: { minor_gcs: number; fullsweep_after: number };
	current_stacktrace: Array<{ module: string; function: string; arity: number; file?: string; line?: number }>;
}

export interface EtsTable {
	name: string;
	id: string;
	type: string;
	size: number;
	memory_bytes: number;
	owner: string | null;
	protection: string;
	read_concurrency: boolean;
	write_concurrency: boolean;
	named_table: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TermValue = any;

export interface EtsRow {
	key: TermValue;
	values: TermValue[];
}

export interface SupervisionNode {
	id: string;
	pid: string | null;
	type: string;
	status: string;
	children: SupervisionNode[];
}

export interface PluginInfo {
	name: string;
	version: string | null;
	callback_module: string | null;
	store_id: string | null;
	has_frontend: boolean;
	health: string;
	loaded_at: number | null;
}

export interface StoreInfo {
	store_id: string;
	running: boolean;
	has_events: boolean;
	stream_count: number;
	ets_tables: Array<{ name: string; size: number; memory_bytes: number }>;
}

export interface StreamInfo {
	stream_id: string;
	version: number;
	event_count: number;
}

export interface EventRecord {
	event_id?: string;
	event_type?: string;
	stream_id?: string;
	version?: number;
	data?: unknown;
	metadata?: unknown;
	timestamp?: number;
	epoch_us?: number;
	[key: string]: unknown;
}

export interface SubscriptionGroup {
	group: string;
	member_count: number;
	members: Array<{
		pid: string;
		alive: boolean;
		registered_name: string | null;
		initial_call: string | null;
	}>;
}

export interface MetricsSnapshot {
	memory: Record<string, number>;
	process_count: number;
	scheduler_utilization: Array<{ scheduler: number; utilization: number }>;
	reductions_delta: number;
	io_delta: { input_bytes: number; output_bytes: number };
	timestamp: number;
}

// --- Stores ---

export const systemOverview = writable<SystemOverview | null>(null);
export const metricsHistory = writable<MetricsSnapshot[]>([]);

// --- Fetch functions ---

export async function fetchSystemOverview(): Promise<SystemOverview> {
	const data = await get<{ ok: boolean } & SystemOverview>('/api/observer/system');
	systemOverview.set(data);
	return data;
}

export async function fetchProcesses(sort = 'memory', limit = 50, offset = 0) {
	return get<{ items: ProcessInfo[]; total: number; limit: number; offset: number }>(
		`/api/observer/processes?sort=${sort}&limit=${limit}&offset=${offset}`
	);
}

export async function fetchProcessDetail(pid: string) {
	return get<{ ok: boolean } & ProcessDetail>(`/api/observer/processes/${pid}`);
}

export async function fetchEtsTables() {
	return get<{ items: EtsTable[]; total: number }>('/api/observer/ets');
}

export async function fetchEtsTableContent(name: string, limit = 50, offset = 0) {
	return get<{
		items: EtsRow[];
		total: number;
		limit: number;
		offset: number;
		table: { name: string; type: string; size: number; protection: string };
	}>(`/api/observer/ets/${name}?limit=${limit}&offset=${offset}`);
}

export async function fetchSupervisionTree(root = 'hecate_sup') {
	return get<{ ok: boolean; tree: SupervisionNode }>(`/api/observer/supervision?root=${root}`);
}

export async function fetchPlugins() {
	return get<{ items: PluginInfo[]; total: number }>('/api/observer/plugins');
}

export async function fetchStores() {
	return get<{ items: StoreInfo[]; total: number }>('/api/observer/stores');
}

export async function fetchStoreStreams(storeId: string) {
	return get<{ items: StreamInfo[]; total: number; store_id: string }>(
		`/api/observer/stores/${storeId}/streams`
	);
}

export async function fetchStreamEvents(storeId: string, streamId: string, offset = 0, limit = 50, direction = 'forward') {
	return get<{ items: EventRecord[]; count: number; store_id: string; stream_id: string; offset: number; limit: number; direction: string }>(
		`/api/observer/stores/${storeId}/streams/${encodeURIComponent(streamId)}?offset=${offset}&limit=${limit}&direction=${direction}`
	);
}

export async function fetchStoreEvents(storeId: string, offset = 0, limit = 50, type?: string) {
	let url = `/api/observer/stores/${storeId}/events?offset=${offset}&limit=${limit}`;
	if (type) url += `&type=${encodeURIComponent(type)}`;
	return get<{ items: EventRecord[]; count: number; store_id: string; offset: number; limit: number; type_filter: string | null }>(url);
}

export async function fetchSubscriptions() {
	return get<{ items: SubscriptionGroup[]; total: number }>('/api/observer/subscriptions');
}

// --- SSE Metrics Stream ---

let metricsSource: EventSource | null = null;
const MAX_HISTORY = 60; // 2 minutes at 2s interval

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
		} catch {
			// ignore parse errors
		}
	});
	metricsSource.onerror = () => {
		stopMetricsStream();
	};
}

export function stopMetricsStream(): void {
	if (metricsSource) {
		metricsSource.close();
		metricsSource = null;
	}
}
