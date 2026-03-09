///
/// Startup checklist executor.
///
/// Drives the app through a sequential startup:
///
///   1. Connect to daemon socket
///   2. Wait for projections to replay
///   3. Load settings
///   4. Load sidebar & plugins
///
/// Each step transitions: pending → active → done (or failed).
/// The overlay renders this checklist visually.
/// Once all steps are done, the app is ready.
///
import { writable, derived, get } from 'svelte/store';
import { health, connectionStatus, startPolling, onReconnect } from './daemon.js';
import { fetchSettings, startSettingsWatcher } from './settings';
import { startAppWatcher } from './apps';
import { startIdentityWatcher } from './nodeIdentity';
import { initSidebar } from './sidebar.js';
import { startTrafficWatcher } from './traffic.js';
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
	{ id: 'socket',      label: 'Daemon socket' },
	{ id: 'projections', label: 'Event replay' },
	{ id: 'settings',    label: 'Settings' },
	{ id: 'plugins',     label: 'Sidebar & plugins' },
];

function initialChecks(): StartupCheck[] {
	return CHECKS.map((c) => ({ ...c, status: 'pending' as CheckStatus, detail: '' }));
}

export const checks = writable<StartupCheck[]>(initialChecks());
export const startupDone = derived(checks, ($c) => $c.every((c) => c.status === 'done'));

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
	// --- Step 1: Connect to daemon ---
	updateCheck('socket', 'active', 'Connecting...');
	await startPolling();

	// Wait for first successful health response
	await waitFor(() => get(connectionStatus) === 'connected', 'socket', 'Waiting for daemon...');
	updateCheck('socket', 'done', 'Connected');

	// --- Step 2: Wait for projections ---
	updateCheck('projections', 'active', 'Replaying events...');
	await waitFor(() => {
		const h = get(health);
		return h !== null && h.ready === true;
	}, 'projections', 'Waiting for projections...');
	updateCheck('projections', 'done', 'Ready');

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
		// Re-run from projections check on reconnect
		updateCheck('projections', 'active', 'Reconnecting...');
		await waitFor(() => {
			const h = get(health);
			return h !== null && h.ready === true;
		}, 'projections', 'Waiting for projections...');
		updateCheck('projections', 'done', 'Ready');
		initSidebar();
		await fetchSettings();
	});
}

/// Poll a condition at 250ms intervals, updating the check detail.
async function waitFor(
	condition: () => boolean,
	checkId: string,
	waitingDetail: string,
	timeoutMs = 60_000
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			updateCheck(checkId, 'failed', 'Timeout');
			return;
		}
		updateCheck(checkId, 'active', waitingDetail);
		await sleep(250);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
