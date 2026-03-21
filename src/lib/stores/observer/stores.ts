// Observer: Event stores, streams, events, snapshots, subscriptions

import { get } from '$lib/api';

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

export interface StoreStats {
	store_id: string;
	stream_count: number;
	total_events: number;
	snapshot_count: number;
	subscription_count: number;
	has_events: boolean;
}

export interface SnapshotInfo {
	stream_id: string;
	version: number;
	timestamp: number | null;
	metadata: Record<string, unknown>;
}

export interface StoreSubscriptionInfo {
	subscription_name: string;
	type: string;
	selector: string;
	checkpoint: number | null;
	pool_size: number;
	created_at: number | null;
	subscriber_pid: string;
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

export async function fetchStoreStats(storeId: string) {
	return get<StoreStats>(`/api/observer/stores/${storeId}/stats`);
}

export async function fetchStoreSnapshots(storeId: string) {
	return get<{ items: SnapshotInfo[]; total: number }>(`/api/observer/stores/${storeId}/snapshots`);
}

export async function fetchStoreSubscriptionDetails(storeId: string) {
	return get<{ items: StoreSubscriptionInfo[]; total: number }>(`/api/observer/stores/${storeId}/subscriptions`);
}
