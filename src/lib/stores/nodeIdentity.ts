import { writable } from 'svelte/store';
import { get as apiGet } from '$lib/api';

export interface NodeIdentity {
	mri: string;
	public_key: string;
	realm: string;
	initialized: boolean;
}

export const nodeIdentity = writable<NodeIdentity | null>(null);

export async function fetchNodeIdentity(): Promise<void> {
	try {
		const data = await apiGet<{ ok: boolean; node_identity: NodeIdentity }>(
			'/api/node/identity'
		);
		nodeIdentity.set(data.node_identity);
	} catch {
		nodeIdentity.set(null);
	}
}

// Identity watcher — periodically re-fetch
let watchTimer: ReturnType<typeof setInterval> | null = null;

export async function startIdentityWatcher(): Promise<void> {
	if (watchTimer) return;
	watchTimer = setInterval(fetchNodeIdentity, 30000);
}

export function stopIdentityWatcher(): void {
	if (watchTimer) {
		clearInterval(watchTimer);
		watchTimer = null;
	}
}
