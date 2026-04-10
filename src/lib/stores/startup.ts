///
/// Startup checklist — local-first boot.
///
/// The daemon boots fully offline. The viewstate from /health drives
/// the overlay display. This module orchestrates the actual startup
/// sequence: connect, wait for ready, load settings, init plugins.
///
/// Mesh activation now happens in the daemon (process manager
/// on_realm_membership_confirmed_activate_mesh), plus the web still
/// fires a POST /api/mesh/activate as a fallback after overlay closes.
///
import { writable, derived, get } from 'svelte/store';
import { health, connectionStatus, startPolling, onReconnect } from './daemon';
import { fetchSettings, startSettingsWatcher } from './settings';
import { startAppWatcher } from './apps';
import { startIdentityWatcher } from './nodeIdentity';
import { initSidebar } from './sidebar.js';
import { startTrafficWatcher } from './traffic.js';
import { startEventStream } from './events.js';
import { checkForUpdate } from './updater.js';
import { checkPluginUpdates } from './pluginUpdater.js';
import { startPolling as startRelayPolling, ensureMeshActivated } from './relay';

/// Elapsed time since startup began (ms). Driven by health polling.
export const elapsedMs = writable(0);
let startTime = 0;

/// Startup is done when daemon reports ready AND we've finished our init.
export const startupDone = writable(false);

/// Run the full startup sequence. Called once from +layout.svelte onMount.
export async function runStartupChecklist(): Promise<void> {
	startTime = Date.now();

	// Start polling daemon health (drives viewstate)
	await startPolling();

	// Wait for daemon socket
	await waitFor(() => get(connectionStatus) === 'connected');

	// Wait for daemon to report ready (stores + projections)
	await waitFor(() => get(health)?.ready === true);

	// Load settings
	try { await fetchSettings(); } catch { /* viewstate shows the failure */ }

	// Init plugins, sidebar, watchers
	startEventStream();
	startAppWatcher();
	startSettingsWatcher();
	startIdentityWatcher();
	startTrafficWatcher();
	initSidebar();
	checkForUpdate();
	checkPluginUpdates();

	// Mark startup done — overlay fades out
	startupDone.set(true);

	// Post-overlay: activate mesh (fallback — daemon PM does this too)
	startRelayPolling();
	ensureMeshActivated();

	// Reconnection handler
	onReconnect(async () => {
		await waitFor(() => get(health)?.ready === true);
		initSidebar();
		await fetchSettings();
	});
}

/// Wait for a condition, polling health updates. Resolves when true or timeout.
function waitFor(condition: () => boolean, timeoutMs = 60_000): Promise<void> {
	if (condition()) return Promise.resolve();

	return new Promise<void>((resolve) => {
		let unsub: (() => void) | null = null;
		let resolved = false;

		function done() {
			if (resolved) return;
			resolved = true;
			queueMicrotask(() => unsub?.());
			resolve();
		}

		unsub = health.subscribe(() => {
			elapsedMs.set(Date.now() - startTime);
			if (condition()) done();
		});

		if (resolved && unsub) unsub();

		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				unsub?.();
				resolve();
			}
		}, timeoutMs);
	});
}
