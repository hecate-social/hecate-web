// Relay neighborhood store — polls /api/mesh/neighborhood for nearby relay data.

import { writable, derived } from 'svelte/store';
import { get as apiGet, post as apiPost } from '$lib/api';
import { isReady } from './daemon';

// --- Types ---

export interface RelayInfo {
	hostname: string;
	city: string | null;
	country: string | null;
	lat?: number;
	lng?: number;
	distance_km?: number;
	rtt_ms?: number | null;
	status?: string;
}

export interface Neighborhood {
	current_relay: RelayInfo | null;
	nearby_relays: RelayInfo[];
	total_known: number;
	total_online: number;
}

// --- State ---

export const neighborhood = writable<Neighborhood | null>(null);

export const currentRelay = derived(neighborhood, ($n) => $n?.current_relay ?? null);
export const nearbyRelays = derived(neighborhood, ($n) => $n?.nearby_relays ?? []);
export const totalOnline = derived(neighborhood, ($n) => $n?.total_online ?? 0);
export const totalKnown = derived(neighborhood, ($n) => $n?.total_known ?? 0);

// --- Polling ---

const POLL_INTERVAL_MS = 10_000;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchNeighborhood(): Promise<void> {
	try {
		const data = await apiGet<Neighborhood & { ok: boolean }>('/api/mesh/neighborhood');
		if (data.ok) {
			neighborhood.set(data);
		}
	} catch {
		// Daemon not ready yet — ignore
	}
}

export function startPolling(): void {
	stopPolling();
	// Only poll when daemon is ready
	const unsub = isReady.subscribe((ready) => {
		if (ready) {
			fetchNeighborhood();
			schedulePoll();
			unsub();
		}
	});
}

function schedulePoll(): void {
	pollTimer = setTimeout(async () => {
		await fetchNeighborhood();
		schedulePoll();
	}, POLL_INTERVAL_MS);
}

export function stopPolling(): void {
	if (pollTimer) {
		clearTimeout(pollTimer);
		pollTimer = null;
	}
}

// --- Mesh activation ---

let meshActivated = false;

/// Ensure mesh is activated. Idempotent — safe to call multiple times.
/// Called from startup checklist and after realm join (proof of network).
export function ensureMeshActivated(): void {
	if (meshActivated) return;
	meshActivated = true;
	apiPost('/api/mesh/activate', {}).catch(() => {
		meshActivated = false; // Allow retry on failure
	});
}
