import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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
	try {
		const update = await invoke<AppUpdate | null>('check_app_update');
		availableUpdate.set(update);
	} catch (e) {
		console.error('[updater] check failed:', e);
	}
}

export async function startUpdate(): Promise<void> {
	let update: AppUpdate | null = null;
	availableUpdate.subscribe((u) => (update = u))();
	if (!update) return;

	updateState.set('downloading');
	downloadProgress.set({ downloaded: 0, total: null });

	const unlisteners: UnlistenFn[] = [];

	try {
		unlisteners.push(
			await listen<{ downloaded: number; total: number | null }>(
				'update-download-progress',
				(event) => {
					downloadProgress.set(event.payload);
				}
			)
		);

		unlisteners.push(
			await listen('update-installing', () => {
				updateState.set('installing');
			})
		);

		unlisteners.push(
			await listen('update-restarting', () => {
				updateState.set('restarting');
			})
		);

		// Rust spawns the new binary and calls exit(0).
		// The invoke will never resolve — the process exits during it.
		await invoke('install_app_update', { url: (update as AppUpdate).asset_url });
		// If we reach here, restart failed
		unlisteners.forEach((u) => u());
	} catch {
		updateState.set('idle');
		unlisteners.forEach((u) => u());
	}
}
