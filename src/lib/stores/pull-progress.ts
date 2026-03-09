import { writable, get } from 'svelte/store';
import { get as apiGet } from '$lib/api';

export interface PullStatus {
	status: 'idle' | 'pulling' | 'downloading' | 'extracting' | 'ready' | 'complete' | 'error';
	percent: number;
	line?: string;
	reason?: string;
}

const POLL_INTERVAL_MS = 500;

export const pullStatus = writable<PullStatus>({ status: 'idle', percent: 0 });

let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentPlugin: string | null = null;

export function startPullPolling(pluginName: string): void {
	stopPullPolling();
	currentPlugin = pluginName;
	pullStatus.set({ status: 'pulling', percent: 0 });

	pollInterval = setInterval(async () => {
		try {
			const res = await apiGet<PullStatus>(
				`/api/plugins/${encodeURIComponent(pluginName)}/pull-status`
			);
			pullStatus.set(res);
			if (res.status === 'ready' || res.status === 'complete' || res.status === 'error') {
				stopPullPolling();
			}
		} catch {
			// Daemon may be offline, keep polling
		}
	}, POLL_INTERVAL_MS);
}

export function stopPullPolling(): void {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
	currentPlugin = null;
}

export function isPulling(): boolean {
	const s = get(pullStatus);
	return s.status === 'pulling' || s.status === 'downloading' || s.status === 'extracting';
}
