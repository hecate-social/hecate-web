// Unified plugin state store
//
// Single source of truth for plugin state.
// Daemon API bootstraps the initial plugin list.
// SSE events drive real-time status updates (no polling for status changes).
// Polling only used as a slow fallback reconciliation loop.

import { writable, derived, get } from 'svelte/store';
import { get as apiGet, post as apiPost, put as apiPut, del as apiDel } from '$lib/api';
import { toastSuccess, toastWarning } from '$lib/stores/toasts';
import { logActivity } from '$lib/stores/activity';
import { onDaemonEvent } from '$lib/stores/events';

// --- Types ---

export interface PluginInfo {
	plugin_id: string;
	name: string;
	display_name: string | null;
	plugin_type: string | null;
	oci_image: string | null;
	package_url: string | null;
	callback_module: string | null;
	installed_version: string;
	license_id: string;
	installed_at: number | null;
	upgraded_at: number | null;
	status: number;
	status_label: string;
	available_actions: string[];
	icon: string | null;
	group_name: string | null;
	group_icon: string | null;
	description: string | null;
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

// Slow fallback poll — SSE is the primary update mechanism.
// This only exists to reconcile state on reconnect or missed events.
const POLL_INTERVAL_MS = 15_000;

export const apps = writable<Map<string, AppState>>(new Map());
export const appsLoaded = writable(false);

export const appList = derived(apps, ($apps) => Array.from($apps.values()));

// --- Helpers ---

/** Derive the technical route name from plugin_id (strip org prefix). */
function routeName(info: PluginInfo): string {
	const id = info.plugin_id;
	const slash = id.lastIndexOf('/');
	return slash >= 0 ? id.substring(slash + 1) : id;
}

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
						const nowHasStop = (info.available_actions ?? []).includes('stop');
						const hadStop = (existing.info.available_actions ?? []).includes('stop');
						logActivity(
							`${info.name} status: ${existing.info.status_label} \u2192 ${info.status_label}`,
							nowHasStop ? 'success' : 'info',
							info.name
						);

						// Detect transitions for toast notifications
						if (nowHasStop && !hadStop) {
							toastSuccess(`${info.name} is online`);
						} else if (hadStop && !nowHasStop) {
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

	// Reconcile: bring online any plugins that are running but not yet loaded in the UI.
	// Only attempt when 'stop' action is available — that means the container is up.
	const current = get(apps);
	for (const [name, app] of current) {
		const actions = app.info.available_actions ?? [];
		if (!app.online && actions.includes('stop')) {
			bringOnline(name, routeName(app.info));
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

async function bringOnline(name: string, techName?: string): Promise<void> {
	if (onlining.has(name)) return;
	onlining.add(name);
	const apiName = techName ?? name;
	let step = 'init';
	try {
		const api = createPluginApi(apiName);
		step = 'manifest';
		const manifest = await api.get<PluginManifest>('/manifest');
		step = 'loadElement';
		const loaded = await loadPluginElement(apiName, manifest.tag);
		step = 'done';

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
		const errMsg = e instanceof Error ? e.message : String(e);
		const isHtml = errMsg.includes('<!doctype') || errMsg.includes('Invalid JSON');
		const detail = isHtml
			? `Plugin API not ready yet — still initializing`
			: `Failed at ${step}: ${errMsg}`;
		apps.update((current) => {
			const next = new Map(current);
			const existing = next.get(name);
			if (existing) {
				next.set(name, { ...existing, _debugError: detail });
			}
			return next;
		});
	} finally {
		onlining.delete(name);
	}
}

// --- SSE event handler ---

/** Handle real-time plugin_status_changed events from daemon SSE. */
function handlePluginStatusChanged(data: unknown): void {
	const evt = data as {
		plugin_id: string;
		name: string;
		status: number;
		status_label: string;
		available_actions: string[];
	};

	apps.update((current) => {
		const next = new Map(current);
		const existing = next.get(evt.name);
		if (!existing) return next; // Unknown plugin — wait for next full poll

		const statusChanged = existing.info.status_label !== evt.status_label;
		if (statusChanged) {
			const nowHasStop = (evt.available_actions ?? []).includes('stop');
			const hadStop = (existing.info.available_actions ?? []).includes('stop');
			logActivity(
				`${evt.name} status: ${existing.info.status_label} \u2192 ${evt.status_label}`,
				nowHasStop ? 'success' : 'info',
				evt.name
			);

			if (nowHasStop && !hadStop) {
				toastSuccess(`${evt.name} is online`);
			} else if (hadStop && !nowHasStop) {
				toastWarning(`${evt.name} went offline`);
			}
		}

		const updatedInfo = {
			...existing.info,
			status: evt.status,
			status_label: evt.status_label,
			available_actions: evt.available_actions
		};

		next.set(evt.name, {
			...existing,
			info: updatedInfo,
			statusChangedAt: statusChanged ? Date.now() : existing.statusChangedAt
		});

		return next;
	});

	// Reconcile: if plugin now has 'stop' action but isn't online in UI, bring it online
	const current = get(apps);
	const app = current.get(evt.name);
	if (app && !app.online && (evt.available_actions ?? []).includes('stop')) {
		bringOnline(evt.name, routeName(app.info));
	}
}

// --- Lifecycle ---

let pollInterval: ReturnType<typeof setInterval> | null = null;
let unsubSSE: (() => void) | null = null;

export async function startAppWatcher(): Promise<void> {
	stopAppWatcher();

	// Subscribe to real-time SSE events
	unsubSSE = onDaemonEvent('plugin_status_changed', handlePluginStatusChanged);

	// Bootstrap: full poll to get initial state
	await pollStatuses();
	appsLoaded.set(true);

	// Slow fallback poll for reconciliation
	pollInterval = setInterval(pollStatuses, POLL_INTERVAL_MS);
}

export function stopAppWatcher(): void {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
	if (unsubSSE) {
		unsubSSE();
		unsubSSE = null;
	}
}

// Trigger an immediate refresh (e.g., after install)
export async function refreshApps(): Promise<void> {
	await pollStatuses();
}
