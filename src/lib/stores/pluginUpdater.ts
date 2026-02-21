import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface PluginUpdate {
	name: string;
	installed_version: string;
	latest_version: string;
	body: string;
}

export type PluginUpdateState = 'idle' | 'pulling' | 'restarting';

export const pluginUpdates = writable<Map<string, PluginUpdate>>(new Map());
export const pluginUpdateStates = writable<Map<string, PluginUpdateState>>(new Map());
export const showPluginUpdateModal = writable<string | null>(null);

export const hasPluginUpdate = derived(pluginUpdates, ($u) => (name: string) => $u.has(name));
export const pluginUpdateVersion = derived(
	pluginUpdates,
	($u) => (name: string) => $u.get(name)?.latest_version ?? null
);

export async function checkPluginUpdates(): Promise<void> {
	try {
		const updates = await invoke<PluginUpdate[]>('check_plugin_updates');
		const map = new Map<string, PluginUpdate>();
		for (const u of updates) {
			map.set(u.name, u);
		}
		pluginUpdates.set(map);
	} catch {
		// Silent — offline or rate-limited
	}
}

export async function installPluginUpdate(name: string): Promise<void> {
	let update: PluginUpdate | undefined;
	pluginUpdates.subscribe(($u) => (update = $u.get(name)))();
	if (!update) return;

	pluginUpdateStates.update((m) => {
		const next = new Map(m);
		next.set(name, 'pulling');
		return next;
	});

	const unlisteners: UnlistenFn[] = [];

	try {
		unlisteners.push(
			await listen<string>('plugin-update-pulling', (event) => {
				if (event.payload === name) {
					pluginUpdateStates.update((m) => {
						const next = new Map(m);
						next.set(name, 'pulling');
						return next;
					});
				}
			})
		);

		unlisteners.push(
			await listen<string>('plugin-update-restarting', (event) => {
				if (event.payload === name) {
					pluginUpdateStates.update((m) => {
						const next = new Map(m);
						next.set(name, 'restarting');
						return next;
					});
				}
			})
		);

		unlisteners.push(
			await listen<string>('plugin-update-done', (event) => {
				if (event.payload === name) {
					// Remove from updates and reset state
					pluginUpdates.update((m) => {
						const next = new Map(m);
						next.delete(name);
						return next;
					});
					pluginUpdateStates.update((m) => {
						const next = new Map(m);
						next.delete(name);
						return next;
					});
					showPluginUpdateModal.set(null);
				}
			})
		);

		await invoke('install_plugin_update', {
			name,
			version: update.latest_version
		});

		unlisteners.forEach((u) => u());
	} catch (e) {
		pluginUpdateStates.update((m) => {
			const next = new Map(m);
			next.delete(name);
			return next;
		});
		unlisteners.forEach((u) => u());
		throw e;
	}
}
