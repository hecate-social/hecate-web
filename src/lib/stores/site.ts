///
/// Site store — tracks site identity and cluster nodes.
///
/// Site = an Erlang cluster sharing a cookie.
/// Realm memberships are separate (managed in Settings).
///
import { writable, derived } from 'svelte/store';
import { get as apiGet, del } from '$lib/api';

// --- Types ---

export interface SiteNode {
	node_name: string;
	admitted_at: number;
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
