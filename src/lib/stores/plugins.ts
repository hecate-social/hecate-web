// Plugin discovery, manifest fetching, and dynamic component loading
import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { get as apiGet, post as apiPost, del as apiDel } from '$lib/api';

interface PluginDiscovery {
	name: string;
	socket_exists: boolean;
}

interface PluginChangedEvent {
	name: string;
	event_type: string;
}

export interface PluginManifest {
	name: string;
	version: string;
	icon: string;
	description: string;
}

export interface LoadedPlugin {
	manifest: PluginManifest;
	component: any; // Svelte component constructor
	api: PluginApi;
}

export interface PluginApi {
	get: <T>(path: string) => Promise<T>;
	post: <T>(path: string, body: unknown) => Promise<T>;
	del: <T>(path: string) => Promise<T>;
}

function createPluginApi(pluginName: string): PluginApi {
	return {
		get: <T>(path: string) => apiGet<T>(`/plugin/${pluginName}${path}`),
		post: <T>(path: string, body: unknown) => apiPost<T>(`/plugin/${pluginName}${path}`, body),
		del: <T>(path: string) => apiDel<T>(`/plugin/${pluginName}${path}`)
	};
}

export const plugins = writable<Map<string, LoadedPlugin>>(new Map());
export const pluginLoadErrors = writable<Map<string, string>>(new Map());
export const isDiscovering = writable(false);

export const pluginList = derived(plugins, ($plugins) => Array.from($plugins.values()));

let unlisten: UnlistenFn | null = null;

export async function discoverPlugins(): Promise<void> {
	isDiscovering.set(true);

	try {
		const discovered: PluginDiscovery[] = await invoke('discover_plugins');
		const currentPlugins = new Map<string, LoadedPlugin>();
		const errors = new Map<string, string>();

		for (const plugin of discovered) {
			if (!plugin.socket_exists) continue;

			try {
				// Fetch manifest
				const api = createPluginApi(plugin.name);
				const manifest = await api.get<PluginManifest>('/manifest');

				// Load component module
				const component = await loadPluginComponent(plugin.name);

				if (component) {
					currentPlugins.set(plugin.name, { manifest, component, api });
				}
			} catch (e) {
				errors.set(plugin.name, e instanceof Error ? e.message : String(e));
			}
		}

		plugins.set(currentPlugins);
		pluginLoadErrors.set(errors);
	} catch (e) {
		console.error('[plugins] Discovery failed:', e);
	} finally {
		isDiscovering.set(false);
	}
}

async function loadSinglePlugin(name: string): Promise<void> {
	try {
		const api = createPluginApi(name);
		const manifest = await api.get<PluginManifest>('/manifest');
		const component = await loadPluginComponent(name);

		if (component) {
			plugins.update((current) => {
				const next = new Map(current);
				next.set(name, { manifest, component, api });
				return next;
			});
		}
	} catch (e) {
		console.error(`[plugins] Failed to load plugin ${name}:`, e);
		pluginLoadErrors.update((current) => {
			const next = new Map(current);
			next.set(name, e instanceof Error ? e.message : String(e));
			return next;
		});
	}
}

async function loadPluginComponent(pluginName: string): Promise<any> {
	const url = `hecate://localhost/plugin/${pluginName}/ui/component.js`;

	try {
		// Try direct dynamic import first (works if WebKitGTK handles hecate:// for ESM)
		const mod = await import(/* @vite-ignore */ url);
		return mod.default;
	} catch {
		// Fallback: fetch as text, create blob URL, then import
		try {
			const resp = await fetch(url);
			if (!resp.ok) return null;
			const text = await resp.text();
			const blob = new Blob([text], { type: 'application/javascript' });
			const blobUrl = URL.createObjectURL(blob);
			const mod = await import(/* @vite-ignore */ blobUrl);
			URL.revokeObjectURL(blobUrl);
			return mod.default;
		} catch (e) {
			console.error(`[plugins] Failed to load component for ${pluginName}:`, e);
			return null;
		}
	}
}

async function handlePluginEvent(event: PluginChangedEvent): Promise<void> {
	switch (event.event_type) {
		case 'rescan':
			await discoverPlugins();
			break;
		case 'socket_up':
			await loadSinglePlugin(event.name);
			break;
		case 'disappeared':
		case 'socket_down':
			plugins.update((current) => {
				const next = new Map(current);
				next.delete(event.name);
				return next;
			});
			pluginLoadErrors.update((current) => {
				const next = new Map(current);
				next.delete(event.name);
				return next;
			});
			break;
		case 'appeared':
			// Dir exists but no socket yet — wait for socket_up
			break;
	}
}

export async function startPluginWatcher(): Promise<void> {
	stopPluginWatcher();
	unlisten = await listen<PluginChangedEvent>('plugin-changed', (e) =>
		handlePluginEvent(e.payload)
	);
	// Initial scan — watcher may emit before listener is ready
	await discoverPlugins();
}

export function stopPluginWatcher(): void {
	if (unlisten) {
		unlisten();
		unlisten = null;
	}
}
