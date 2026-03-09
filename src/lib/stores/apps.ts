// Unified plugin state store
//
// Single source of truth for plugin state.
// Daemon API is the source of truth for installed plugins.
// Polling detects online/offline transitions.

import { writable, derived, get } from 'svelte/store';
import { get as apiGet, post as apiPost, put as apiPut, del as apiDel } from '$lib/api';
import { toastSuccess, toastWarning } from '$lib/stores/toasts';
import { logActivity } from '$lib/stores/activity';

// --- Types ---

export interface PluginInfo {
	plugin_id: string;
	name: string;
	display_name: string | null;
	oci_image: string;
	installed_version: string;
	license_id: string;
	installed_at: number | null;
	upgraded_at: number | null;
	status: number;
	status_label: string;
	icon: string | null;
	group_name: string | null;
}

export interface PluginManifest {
	name: string;
	display_name?: string;
	version: string;
	icon: string;
	description: string;
	tag: string;
}

export interface PluginApi {
	get: <T>(path: string) => Promise<T>;
	post: <T>(path: string, body: unknown) => Promise<T>;
	put: <T>(path: string, body: unknown) => Promise<T>;
	del: <T>(path: string) => Promise<T>;
}

export interface AppState {
	info: PluginInfo;
	manifest: PluginManifest | null;
	tag: string | null;
	api: PluginApi | null;
	online: boolean;
	statusChangedAt: number;
	_debugError?: string;
}

// --- Store ---

const POLL_INTERVAL_MS = 3000;

export const apps = writable<Map<string, AppState>>(new Map());

export const appList = derived(apps, ($apps) => Array.from($apps.values()));

// --- Helpers ---

function createPluginApi(pluginName: string): PluginApi {
	return {
		get: <T>(path: string) => apiGet<T>(`/plugin/${pluginName}/api${path}`),
		post: <T>(path: string, body: unknown) => apiPost<T>(`/plugin/${pluginName}/api${path}`, body),
		put: <T>(path: string, body: unknown) => apiPut<T>(`/plugin/${pluginName}/api${path}`, body),
		del: <T>(path: string) => apiDel<T>(`/plugin/${pluginName}/api${path}`)
	};
}

// --- Daemon status polling ---

async function pollStatuses(): Promise<void> {
	try {
		const res = await apiGet<{ items: PluginInfo[] }>('/api/appstore/plugins');

		apps.update((current) => {
			const next = new Map(current);
			const seen = new Set<string>();

			for (const info of res.items) {
				seen.add(info.name);
				const existing = next.get(info.name);
				if (existing) {
					const statusChanged = existing.info.status_label !== info.status_label;
					if (statusChanged) {
						logActivity(
							`${info.name} status: ${existing.info.status_label} \u2192 ${info.status_label}`,
							info.status_label === 'Running' ? 'success' : 'info',
							info.name
						);

						// Detect transitions for toast notifications
						if (info.status_label === 'Running' && !existing.online) {
							toastSuccess(`${info.name} is online`);
						} else if (existing.info.status_label === 'Running' && info.status_label !== 'Running') {
							toastWarning(`${info.name} went offline`);
						}
					}
					next.set(info.name, {
						...existing,
						info,
						statusChangedAt: statusChanged ? Date.now() : existing.statusChangedAt
					});
				} else {
					next.set(info.name, {
						info,
						manifest: null,
						tag: null,
						api: null,
						online: false,
						statusChangedAt: Date.now()
					});
				}
			}

			// Remove plugins no longer reported by daemon
			for (const name of next.keys()) {
				if (!seen.has(name)) {
					next.delete(name);
				}
			}

			return next;
		});
	} catch {
		// Daemon may be offline
		return;
	}

	// Reconcile: bring online any plugins that may be running but aren't loaded yet.
	const current = get(apps);
	for (const [name, app] of current) {
		if (!app.online && (app.info.status_label === 'Running' || app.info.status_label === 'Starting')) {
			console.log(`[apps] Attempting bringOnline for ${name} (status: ${app.info.status_label})`);
			bringOnline(name);
		}
	}
}

// --- Custom element loading ---

async function loadPluginElement(pluginName: string, tag: string): Promise<boolean> {
	if (customElements.get(tag)) return true;

	const url = `/plugin/${pluginName}/ui/component.js`;
	try {
		const resp = await fetch(url);
		if (!resp.ok) {
			console.warn(`[apps] component.js fetch failed for ${pluginName}: ${resp.status}`);
			return false;
		}
		const text = await resp.text();
		const blob = new Blob([text], { type: 'application/javascript' });
		const blobUrl = URL.createObjectURL(blob);
		try {
			await import(/* @vite-ignore */ blobUrl);
		} finally {
			URL.revokeObjectURL(blobUrl);
		}
		const registered = customElements.get(tag) !== undefined;
		if (!registered) {
			console.warn(`[apps] component.js loaded for ${pluginName} but <${tag}> not registered`);
		}
		return registered;
	} catch (e) {
		// If element was already registered by a concurrent call, that's fine
		if (customElements.get(tag)) return true;
		console.error(`[apps] Failed to load element for ${pluginName}:`, e);
		return false;
	}
}

const onlining = new Set<string>();

async function bringOnline(name: string): Promise<void> {
	if (onlining.has(name)) return;
	onlining.add(name);
	try {
		const api = createPluginApi(name);
		const manifest = await api.get<PluginManifest>('/manifest');
		const loaded = await loadPluginElement(name, manifest.tag);

		apps.update((current) => {
			const next = new Map(current);
			const existing = next.get(name);
			if (existing) {
				if (loaded) {
					next.set(name, { ...existing, manifest, tag: manifest.tag, api, online: true });
				} else {
					next.set(name, { ...existing, manifest, tag: manifest.tag, api, online: false,
						_debugError: `Custom element <${manifest.tag}> not registered after import` });
				}
			}
			return next;
		});
	} catch (e) {
		apps.update((current) => {
			const next = new Map(current);
			const existing = next.get(name);
			if (existing) {
				next.set(name, { ...existing,
					_debugError: `bringOnline failed: ${e instanceof Error ? e.message : String(e)}` });
			}
			return next;
		});
	} finally {
		onlining.delete(name);
	}
}

// --- Lifecycle ---

let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function startAppWatcher(): Promise<void> {
	stopAppWatcher();
	await pollStatuses();
	pollInterval = setInterval(pollStatuses, POLL_INTERVAL_MS);
}

export function stopAppWatcher(): void {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
}

// Trigger an immediate refresh (e.g., after install)
export async function refreshApps(): Promise<void> {
	await pollStatuses();
}
