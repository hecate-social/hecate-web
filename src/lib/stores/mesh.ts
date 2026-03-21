// Mesh store — real-time peer state via SSE + status/discovery API.

import { get } from '$lib/api';
import { isTauri } from '$lib/tauri';

// --- Types ---

export interface MeshStatus {
	connected: boolean;
	realm: string;
	identity: string;
	node_id: string | null;
	bootstrap: string[];
	subscriptions: string[];
}

export interface MeshPeer {
	node_id: string;
	endpoint?: string;
	connected_at?: number;
}

export interface MeshSubscriber {
	node_id: string;
	endpoint: string;
}

export interface DiscoverResult {
	ok: boolean;
	subscribers: MeshSubscriber[];
}

export interface MeshInitialEvent {
	peers: MeshPeer[];
	self: { node_id?: string; identity?: string; realm?: string };
	connected: boolean;
}

// --- Fetch functions ---

export async function fetchMeshStatus(): Promise<MeshStatus> {
	return get<MeshStatus>('/api/mesh/status');
}

export async function discoverSubscribers(topic: string): Promise<DiscoverResult> {
	return get<DiscoverResult>(`/api/mesh/discover?topic=${encodeURIComponent(topic)}`);
}

// --- SSE Stream ---

export type MeshEventCallback = (
	type: 'initial' | 'peer_connected' | 'peer_disconnected' | 'error' | 'open',
	data?: MeshInitialEvent | MeshPeer | Event
) => void;

export function connectMeshSSE(callback: MeshEventCallback): () => void {
	const base = isTauri() && !import.meta.env.DEV ? 'hecate://localhost' : '';
	const url = `${base}/api/mesh/events`;
	const es = new EventSource(url);

	es.onopen = () => callback('open');
	es.onerror = (e) => callback('error', e);

	es.addEventListener('mesh_initial', (e: MessageEvent) => {
		try {
			const data: MeshInitialEvent = JSON.parse(e.data);
			callback('initial', data);
		} catch { /* ignore parse errors */ }
	});

	es.addEventListener('mesh_peer_connected', (e: MessageEvent) => {
		try {
			const peer: MeshPeer = JSON.parse(e.data);
			callback('peer_connected', peer);
		} catch { /* ignore */ }
	});

	es.addEventListener('mesh_peer_disconnected', (e: MessageEvent) => {
		try {
			const peer: MeshPeer = JSON.parse(e.data);
			callback('peer_disconnected', peer);
		} catch { /* ignore */ }
	});

	return () => es.close();
}
