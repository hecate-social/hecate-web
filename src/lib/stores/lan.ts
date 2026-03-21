///
/// LAN discovery store — machines found on the local network.
///
import { writable, derived } from 'svelte/store';
import { get as apiGet, post } from '$lib/api';

export interface HecateInfo {
	running: boolean;
	version?: string;
	status?: string;
	ready?: boolean;
}

export interface LanNode {
	ip: string;
	hostname: string;
	mac: string;
	interface: string;
	ssh: boolean;
	hecate: HecateInfo;
}

export interface LanScanResult {
	nodes: LanNode[];
	hecate_count: number;
	bare_count: number;
	total: number;
}

// --- Stores ---

export const lanNodes = writable<LanNode[]>([]);
export const lanLoading = writable(false);
export const lanError = writable<string | null>(null);
export const lastScanAt = writable<number | null>(null);

// --- Derived ---

export const hecateNodes = derived(lanNodes, ($n) =>
	$n.filter((n) => n.hecate.running)
);

export const bareNodes = derived(lanNodes, ($n) =>
	$n.filter((n) => !n.hecate.running)
);

export const lanNodeCount = derived(lanNodes, ($n) => $n.length);

// --- Actions ---

export async function fetchLanNodes(): Promise<void> {
	lanLoading.set(true);
	lanError.set(null);
	try {
		const data = await apiGet<LanScanResult & { ok: boolean }>('/api/lan/nodes');
		lanNodes.set(data.nodes ?? []);
		lastScanAt.set(Date.now());
	} catch (e) {
		lanError.set(e instanceof Error ? e.message : String(e));
	} finally {
		lanLoading.set(false);
	}
}

export async function triggerScan(): Promise<void> {
	lanLoading.set(true);
	try {
		await post<{ ok: boolean }>('/api/lan/scan', {});
		// Wait a moment for scan to complete, then fetch
		setTimeout(() => fetchLanNodes(), 3000);
	} catch (e) {
		lanError.set(e instanceof Error ? e.message : String(e));
		lanLoading.set(false);
	}
}
