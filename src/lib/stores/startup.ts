///
/// Startup checklist — local-first boot.
///
/// The daemon boots fully offline. This checklist tracks LOCAL
/// readiness only: socket, stores, settings, plugins.
///
/// Mesh activation happens AFTER the UI is visible — the user
/// watches the connection happen in the header, not the splash screen.
///
import { writable, derived, get } from 'svelte/store';
import { health, connectionStatus, startPolling, onReconnect } from './daemon.js';
import { fetchSettings, startSettingsWatcher } from './settings';
import { startAppWatcher } from './apps';
import { startIdentityWatcher } from './nodeIdentity';
import { initSidebar } from './sidebar.js';
import { startTrafficWatcher } from './traffic.js';
import { startEventStream } from './events.js';
import { checkForUpdate } from './updater.js';
import { checkPluginUpdates } from './pluginUpdater.js';
import { startPolling as startRelayPolling } from './relay';
import { post as apiPost } from '$lib/api';
import type { DaemonHealth } from '../types.js';

export type CheckStatus = 'pending' | 'active' | 'done' | 'failed';

export interface StartupCheck {
	id: string;
	label: string;
	status: CheckStatus;
	detail: string;
}

const CHECKS: Omit<StartupCheck, 'status' | 'detail'>[] = [
	{ id: 'socket',   label: 'Daemon' },
	{ id: 'stores',   label: 'Data stores' },
	{ id: 'settings', label: 'Settings' },
	{ id: 'plugins',  label: 'Plugins' },
];

function initialChecks(): StartupCheck[] {
	return CHECKS.map((c) => ({ ...c, status: 'pending' as CheckStatus, detail: '' }));
}

export const checks = writable<StartupCheck[]>(initialChecks());
export const startupDone = derived(checks, ($c) => $c.every((c) => c.status === 'done'));

/// Elapsed time since startup began (ms). Driven by health polling.
export const elapsedMs = writable(0);
let startTime = 0;

function updateCheck(id: string, status: CheckStatus, detail = '') {
	checks.update(($c) =>
		$c.map((c) => (c.id === id ? { ...c, status, detail } : c))
	);
}

/// Run the full startup checklist. Called once from +layout.svelte onMount.
export async function runStartupChecklist(): Promise<void> {
	startTime = Date.now();

	// --- Step 1: Connect to daemon socket ---
	updateCheck('socket', 'active', 'Connecting...');
	await startPolling();

	await waitForReactive(
		() => get(connectionStatus) === 'connected',
		'socket',
		'Waiting for daemon...'
	);
	updateCheck('socket', 'done', 'Connected');

	// --- Step 2: Wait for stores + projections (daemon reports ready) ---
	updateCheck('stores', 'active', 'Starting...');
	await waitForReady();
	updateCheck('stores', 'done', 'Ready');

	// --- Step 3: Load settings ---
	updateCheck('settings', 'active', 'Loading...');
	try {
		await fetchSettings();
		updateCheck('settings', 'done', 'Loaded');
	} catch {
		updateCheck('settings', 'failed', 'Failed to load');
	}

	// --- Step 4: Sidebar & plugins ---
	updateCheck('plugins', 'active', 'Initializing...');
	startEventStream();
	startAppWatcher();
	startSettingsWatcher();
	startIdentityWatcher();
	startTrafficWatcher();
	initSidebar();
	checkForUpdate();
	checkPluginUpdates();
	updateCheck('plugins', 'done', 'Ready');

	// --- Post-overlay: activate mesh (non-blocking) ---
	// The UI is fully visible. User sees "Local" in header.
	// This triggers relay connection — user watches it happen live.
	startRelayPolling();
	activateMesh();

	// --- Reconnection handler ---
	onReconnect(async () => {
		updateCheck('stores', 'active', 'Reconnecting...');

		await safeSubscribe(health, (h, done) => {
			if (!h) return;
			if (h.ready) {
				updateCheck('stores', 'done', 'Reconnected');
				done();
			} else if (h.boot) {
				const detail = h.boot.stores_total > 0
					? `${h.boot.stores_ready}/${h.boot.stores_total} stores`
					: 'Restarting...';
				updateCheck('stores', 'active', detail);
			}
		}, 60_000);

		initSidebar();
		await fetchSettings();
	});
}

/// Wait for daemon to report ready (stores + projections caught up).
async function waitForReady(): Promise<void> {
	return safeSubscribe(health, (h, done) => {
		elapsedMs.set(Date.now() - startTime);
		if (!h) return;

		if (h.ready) {
			done();
			return;
		}

		// Show store progress during boot
		const boot = h.boot;
		if (boot && boot.stores_total > 0) {
			const storeNames = boot.stores ? Object.entries(boot.stores)
				.filter(([, s]) => s === 'ready')
				.map(([name]) => name.replace(/_store$/, ''))
				.join(', ') : '';
			const detail = `${boot.stores_ready}/${boot.stores_total} stores`;
			const sub = storeNames ? `\n${storeNames}` : '';
			updateCheck('stores', 'active', detail + sub);
		}
	}, 60_000);
}

/// Activate mesh connection — fire and forget.
/// Called after UI is fully rendered. User sees transition in header.
function activateMesh(): void {
	apiPost('/api/mesh/activate', {}).catch(() => {
		// Mesh activation failed (no network, etc.) — that's fine.
		// Local mode continues. Relay polling will show status.
	});
}

/// Subscribe to a Svelte store safely — avoids the synchronous-first-call
/// race where `unsubscribe` is not yet assigned when the callback fires.
function safeSubscribe<T>(
	store: { subscribe: (fn: (v: T) => void) => () => void },
	callback: (value: T, done: () => void) => void,
	timeoutMs = 60_000
): Promise<void> {
	return new Promise<void>((resolve) => {
		let unsub: (() => void) | null = null;
		let resolved = false;

		function done() {
			if (resolved) return;
			resolved = true;
			if (unsub) {
				unsub();
			} else {
				queueMicrotask(() => unsub?.());
			}
			resolve();
		}

		unsub = store.subscribe((value) => {
			if (!resolved) callback(value, done);
		});

		if (resolved && unsub) {
			unsub();
		}

		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				unsub?.();
				resolve();
			}
		}, timeoutMs);
	});
}

/// Wait for a condition, checking each time health or connection status updates.
async function waitForReactive(
	condition: () => boolean,
	checkId: string,
	waitingDetail: string,
	timeoutMs = 60_000
): Promise<void> {
	if (condition()) return;

	return new Promise<void>((resolve) => {
		let unsubHealth: (() => void) | null = null;
		let unsubConn: (() => void) | null = null;
		let resolved = false;

		function done() {
			if (resolved) return;
			resolved = true;
			queueMicrotask(() => {
				unsubHealth?.();
				unsubConn?.();
			});
			resolve();
		}

		unsubHealth = health.subscribe(() => {
			elapsedMs.set(Date.now() - startTime);
			if (condition()) done();
			else updateCheck(checkId, 'active', waitingDetail);
		});

		unsubConn = connectionStatus.subscribe(() => {
			if (condition()) done();
		});

		if (resolved) {
			unsubHealth?.();
			unsubConn?.();
		}

		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				unsubHealth?.();
				unsubConn?.();
				updateCheck(checkId, 'failed', 'Timeout');
				resolve();
			}
		}, timeoutMs);
	});
}
