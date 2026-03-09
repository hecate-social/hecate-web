// Plugin updater store — Tauri-only feature.
// When running inside Tauri, checks for plugin OCI image updates.
// In browser mode, all operations are no-ops.

import { writable, derived } from 'svelte/store';
import { isTauri } from '$lib/tauri';

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
	if (!isTauri()) return;
	try {
		const { invoke } = await import('@tauri-apps/api/core');
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
	if (!isTauri()) return;

	let update: PluginUpdate | undefined;
	pluginUpdates.subscribe(($u) => (update = $u.get(name)))();
	if (!update) return;

	pluginUpdateStates.update((m) => {
		const next = new Map(m);
		next.set(name, 'pulling');
		return next;
	});

	try {
		const { invoke } = await import('@tauri-apps/api/core');
		const { listen } = await import('@tauri-apps/api/event');

		const unlisteners: (() => void)[] = [];

		unlisteners.push(
			await listen<string>('plugin-update-pulling', (event) => {
				if (event.payload === name) {
					pluginUpdateStates.update((m) => new Map(m).set(name, 'pulling'));
				}
			})
		);

		unlisteners.push(
			await listen<string>('plugin-update-restarting', (event) => {
				if (event.payload === name) {
					pluginUpdateStates.update((m) => new Map(m).set(name, 'restarting'));
				}
			})
		);

		unlisteners.push(
			await listen<string>('plugin-update-done', (event) => {
				if (event.payload === name) {
					pluginUpdates.update((m) => { const n = new Map(m); n.delete(name); return n; });
					pluginUpdateStates.update((m) => { const n = new Map(m); n.delete(name); return n; });
					showPluginUpdateModal.set(null);
				}
			})
		);

		await invoke('install_plugin_update', { name, version: update.latest_version });
		unlisteners.forEach((u) => u());
	} catch (e) {
		pluginUpdateStates.update((m) => { const n = new Map(m); n.delete(name); return n; });
		throw e;
	}
}
