// Mesh visibility store — fetch mesh status and discover subscribers.

import { get } from '$lib/api';

// --- Types ---

export interface MeshStatus {
	connected: boolean;
	realm: string;
	identity: string;
	node_id: string | null;
	bootstrap: string[];
	subscriptions: string[];
}

export interface MeshSubscriber {
	node_id: string;
	endpoint: string;
}

export interface DiscoverResult {
	ok: boolean;
	subscribers: MeshSubscriber[];
}

// --- Fetch functions ---

export async function fetchMeshStatus(): Promise<MeshStatus> {
	return get<MeshStatus>('/api/mesh/status');
}

export async function discoverSubscribers(topic: string): Promise<DiscoverResult> {
	return get<DiscoverResult>(`/api/mesh/discover?topic=${encodeURIComponent(topic)}`);
}
