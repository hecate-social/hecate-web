///
/// Site store — tracks site identity and cluster nodes.
///
/// Site = an Erlang cluster sharing a cookie.
/// Realm memberships are separate (managed in Settings).
///
import { writable, derived } from 'svelte/store';
import { get as apiGet, del } from '$lib/api';
import { onDaemonEvent } from '$lib/stores/events';

// --- Types ---

export interface SiteNode {
	node_name: string;
	admitted_at: number;
	pending?: boolean;
}

export interface SiteData {
	site_id: string;
	nodes: SiteNode[];
	node_count: number;
	status: number;
	status_label: string;
	initiated_at: number | null;
	initiated_by: string | null;
}

// --- Stores ---

export const site = writable<SiteData | null>(null);
export const siteLoading = writable(false);
export const siteError = writable<string | null>(null);

// --- Derived ---

export const siteInitiated = derived(site, ($s) => $s !== null && ($s.status & 1) !== 0);
export const siteNodeCount = derived(site, ($s) => $s?.nodes?.length ?? 0);

// --- Actions ---

export async function fetchSite(): Promise<void> {
	siteLoading.set(true);
	siteError.set(null);
	try {
		const data = await apiGet<SiteData & { ok: boolean }>('/api/site');
		site.set(data);
	} catch (e) {
		if (e instanceof Error && e.message.includes('404')) {
			site.set(null);
		} else {
			siteError.set(e instanceof Error ? e.message : String(e));
		}
	} finally {
		siteLoading.set(false);
	}
}

export async function removeNode(nodeName: string): Promise<void> {
	const data = await del<{ ok: boolean }>(`/api/site/nodes/${encodeURIComponent(nodeName)}`);
	if (data.ok) {
		await fetchSite();
	}
}

// --- Optimistic updates ---

/** Add a node optimistically before the daemon confirms admission. */
export function addPendingNode(nodeName: string): void {
	site.update(($s) => {
		if (!$s) return $s;
		// Don't add if already present
		if ($s.nodes.some((n) => n.node_name === nodeName)) return $s;
		return {
			...$s,
			nodes: [...$s.nodes, { node_name: nodeName, admitted_at: Date.now(), pending: true }],
			node_count: $s.node_count + 1,
		};
	});
}

// --- SSE: reactive updates from daemon ---

onDaemonEvent('site_changed', (_data) => {
	// Re-fetch full site state when the daemon broadcasts a change.
	// The SSE payload contains the site, but re-fetching via API
	// ensures we get the exact same shape the store expects.
	fetchSite();
});
