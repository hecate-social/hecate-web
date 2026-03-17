///
/// Startup checklist — reactive to health store changes.
///
/// Subscribes to the health store and transitions checks immediately
/// when state changes. No independent sleep loops.
///
/// Steps:
///   1. Connect to daemon socket
///   2. Wait for event stores (shows per-store progress)
///   3. Wait for store subscriptions
///   4. Wait for projection replay
///   5. Load settings
///   6. Load sidebar & plugins
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
import type { DaemonHealth } from '../types.js';

export type CheckStatus = 'pending' | 'active' | 'done' | 'failed';

export interface StartupCheck {
	id: string;
	label: string;
	status: CheckStatus;
	detail: string;
}

const CHECKS: Omit<StartupCheck, 'status' | 'detail'>[] = [
	{ id: 'socket',        label: 'Daemon socket' },
	{ id: 'stores',        label: 'Event stores' },
	{ id: 'subscriptions', label: 'Subscriptions' },
	{ id: 'projections',   label: 'Event replay' },
	{ id: 'settings',      label: 'Settings' },
	{ id: 'plugins',       label: 'Sidebar & plugins' },
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

function getCheck(id: string): StartupCheck | undefined {
	return get(checks).find((c) => c.id === id);
}

/// Run the full startup checklist. Called once from +layout.svelte onMount.
export async function runStartupChecklist(): Promise<void> {
	startTime = Date.now();

	// --- Step 1: Connect to daemon ---
	updateCheck('socket', 'active', 'Connecting...');
	await startPolling();

	await waitForReactive(
		() => get(connectionStatus) === 'connected',
		'socket',
		'Waiting for daemon...'
	);
	updateCheck('socket', 'done', 'Connected');

	// --- Steps 2-4: Reactive health-driven transitions ---
	updateCheck('stores', 'active', 'Starting stores...');

	await waitForHealthPhases();

	// --- Step 5: Load settings ---
	updateCheck('settings', 'active', 'Loading...');
	try {
		await fetchSettings();
		updateCheck('settings', 'done', 'Loaded');
	} catch {
		updateCheck('settings', 'failed', 'Failed to load');
	}

	// --- Step 6: Sidebar & plugins ---
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

	// --- Reconnection handler ---
	onReconnect(async () => {
		updateCheck('stores', 'active', 'Reconnecting...');
		updateCheck('subscriptions', 'pending', '');
		updateCheck('projections', 'pending', '');

		await safeSubscribe(health, (h, done) => {
			if (!h) return;
			if (h.ready) {
				updateCheck('stores', 'done', 'Reconnected');
				updateCheck('subscriptions', 'done', 'Ready');
				updateCheck('projections', 'done', 'Ready');
				done();
			} else if (h.boot) {
				if (h.boot.boot_phase === 'booting_stores') {
					updateCheck('stores', 'active',
						`${h.boot.stores_ready}/${h.boot.stores_total} stores ready`);
				} else {
					updateCheck('stores', 'done', 'Ready');
					updateCheck('subscriptions', 'active', 'Reconnecting...');
				}
			}
		}, 60_000);

		initSidebar();
		await fetchSettings();
	});
}

/// Subscribe to health and drive steps 2-4 (stores, subscriptions, projections).
async function waitForHealthPhases(): Promise<void> {
	return safeSubscribe(health, (h, done) => {
		elapsedMs.set(Date.now() - startTime);
		if (!h) return;

		// Fast-path: daemon already running
		if (h.ready && getCheck('projections')?.status !== 'done') {
			updateCheck('stores', 'done', 'Ready');
			updateCheck('subscriptions', 'done', 'Ready');
			updateCheck('projections', 'done', 'Ready');
			done();
			return;
		}

		// Step 2: Stores
		const storesCheck = getCheck('stores');
		if (storesCheck && storesCheck.status !== 'done') {
			const boot = h.boot;
			if (boot) {
				const storesDone = boot.boot_phase !== 'booting_stores' && boot.boot_phase !== 'initializing';
				if (storesDone) {
					updateCheck('stores', 'done', `${boot.stores_ready} stores ready`);
					updateCheck('subscriptions', 'active', 'Starting subscriptions...');
				} else {
					const storeNames = boot.stores ? Object.entries(boot.stores)
						.filter(([, s]) => s === 'ready')
						.map(([name]) => name.replace(/_store$/, ''))
						.join(', ') : '';
					const detail = boot.stores_total > 0
						? `${boot.stores_ready}/${boot.stores_total} stores ready`
						: 'Starting stores...';
					const sub = storeNames ? `\n${storeNames}` : '';
					updateCheck('stores', 'active', detail + sub);
				}
			} else if (h.ready) {
				updateCheck('stores', 'done', 'Ready');
				updateCheck('subscriptions', 'active', 'Checking...');
			}
		}

		// Step 3: Subscriptions
		const subsCheck = getCheck('subscriptions');
		if (subsCheck && subsCheck.status === 'active') {
			const boot = h.boot;
			const subsDone = !boot ||
				(boot.boot_phase !== 'booting_stores' &&
				 boot.boot_phase !== 'starting_subscriptions' &&
				 boot.boot_phase !== 'initializing');
			if (subsDone) {
				updateCheck('subscriptions', 'done', 'Ready');
				updateCheck('projections', 'active', 'Replaying events...');
			}
		}

		// Step 4: Projections
		const projCheck = getCheck('projections');
		if (projCheck && projCheck.status === 'active') {
			if (h.ready) {
				updateCheck('projections', 'done', 'Ready');
				done();
			} else if (h.boot?.boot_phase === 'replaying') {
				updateCheck('projections', 'active', 'Replaying events...');
			}
		}
	}, 60_000);
}

/// Subscribe to a Svelte store safely — avoids the synchronous-first-call
/// race where `unsubscribe` is not yet assigned when the callback fires.
///
/// The callback receives the store value and a `done()` function to call
/// when it wants to unsubscribe and resolve the promise.
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
			// Defer unsubscribe to avoid calling it during the synchronous first invocation
			if (unsub) {
				unsub();
			} else {
				// Will be cleaned up after subscribe() returns
				queueMicrotask(() => unsub?.());
			}
			resolve();
		}

		unsub = store.subscribe((value) => {
			if (!resolved) callback(value, done);
		});

		// If resolved synchronously during subscribe(), clean up now
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

		// Clean up if resolved synchronously
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
