// App updater store — Tauri-only feature.
// When running inside Tauri, checks for app binary updates.
// In browser mode, all operations are no-ops.

import { writable, derived } from 'svelte/store';
import { isTauri } from '$lib/tauri';

export interface AppUpdate {
	version: string;
	body: string;
	asset_url: string;
}

export type UpdateState = 'idle' | 'downloading' | 'installing' | 'restarting';

export const availableUpdate = writable<AppUpdate | null>(null);
export const updateState = writable<UpdateState>('idle');
export const downloadProgress = writable<{ downloaded: number; total: number | null }>({
	downloaded: 0,
	total: null
});
export const showUpdateModal = writable(false);

export const hasUpdate = derived(availableUpdate, ($u) => $u !== null);
export const updateVersion = derived(availableUpdate, ($u) => $u?.version ?? null);

export async function checkForUpdate(): Promise<void> {
	if (!isTauri()) return;
	try {
		const { invoke } = await import('@tauri-apps/api/core');
		const update = await invoke<AppUpdate | null>('check_app_update');
		availableUpdate.set(update);
	} catch {
		// Silent — offline or rate-limited
	}
}

export async function startUpdate(): Promise<void> {
	if (!isTauri()) return;

	let update: AppUpdate | null = null;
	availableUpdate.subscribe((u) => (update = u))();
	if (!update) return;

	updateState.set('downloading');
	downloadProgress.set({ downloaded: 0, total: null });

	try {
		const { invoke } = await import('@tauri-apps/api/core');
		const { listen } = await import('@tauri-apps/api/event');

		const unlisteners: (() => void)[] = [];

		unlisteners.push(
			await listen<{ downloaded: number; total: number | null }>(
				'update-download-progress',
				(event) => downloadProgress.set(event.payload)
			)
		);

		unlisteners.push(
			await listen('update-installing', () => updateState.set('installing'))
		);

		unlisteners.push(
			await listen('update-restarting', () => updateState.set('restarting'))
		);

		await invoke('install_app_update', { url: (update as AppUpdate).asset_url });
		unlisteners.forEach((u) => u());
	} catch {
		updateState.set('idle');
	}
}
