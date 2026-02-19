import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';

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
	} catch {
		// Silent — offline or rate-limited
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

		await invoke('install_app_update', { url: (update as AppUpdate).asset_url });

		updateState.set('restarting');
		unlisteners.forEach((u) => u());
		await relaunch();
	} catch {
		updateState.set('idle');
		unlisteners.forEach((u) => u());
	}
}
