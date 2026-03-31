<script lang="ts">
	import '../app.css';
	import TitleBar from '$lib/components/TitleBar.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import Launcher from '$lib/components/Launcher.svelte';
	import DaemonStartingOverlay from '$lib/components/DaemonStartingOverlay.svelte';
	import OnboardingOverlay from '$lib/components/OnboardingOverlay.svelte';
	import UpdateModal from '$lib/components/UpdateModal.svelte';
	import PluginUpdateModal from '$lib/components/PluginUpdateModal.svelte';
	import KeyboardShortcutsHelp from '$lib/components/KeyboardShortcutsHelp.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import { stopPolling } from '$lib/stores/daemon.js';
	import { stopSettingsWatcher } from '$lib/stores/settings';
	import { stopAppWatcher } from '$lib/stores/apps';
	import { stopIdentityWatcher } from '$lib/stores/nodeIdentity';
	import { stopTrafficWatcher } from '$lib/stores/traffic.js';
	import { stopEventStream } from '$lib/stores/events.js';
	import { checkForUpdate } from '$lib/stores/updater.js';
	import { checkPluginUpdates } from '$lib/stores/pluginUpdater.js';
	import { pluginPaths, pluginTabs } from '$lib/plugins-registry';
	import { runStartupChecklist } from '$lib/stores/startup';
	import { dispatchKeydown, registerShortcut } from '$lib/stores/keyboard';
	import '$lib/stores/theme.js';
	import '$lib/stores/zoom';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';

	let { children } = $props();
	let updateInterval: ReturnType<typeof setInterval>;

	// --- Register shortcuts ---
	const unregisterTabForward = registerShortcut({
		key: 'Tab',
		modifiers: ['ctrl'],
		label: 'Next Page',
		category: 'Navigation',
		handler: () => {
			const paths = get(pluginPaths);
			const current = page.url?.pathname ?? '/';
			const idx = paths.findIndex((p) =>
				p === '/' ? current === '/' : current.startsWith(p)
			);
			const currentIdx = idx >= 0 ? idx : 0;
			const nextIdx = (currentIdx + 1) % paths.length;
			goto(paths[nextIdx]);
		},
	});

	const unregisterTabBackward = registerShortcut({
		key: 'Tab',
		modifiers: ['ctrl', 'shift'],
		label: 'Previous Page',
		category: 'Navigation',
		handler: () => {
			const paths = get(pluginPaths);
			const current = page.url?.pathname ?? '/';
			const idx = paths.findIndex((p) =>
				p === '/' ? current === '/' : current.startsWith(p)
			);
			const currentIdx = idx >= 0 ? idx : 0;
			const nextIdx = (currentIdx - 1 + paths.length) % paths.length;
			goto(paths[nextIdx]);
		},
	});

	// Alt+1-9: jump to nth tab
	const unregisterAltNums: (() => void)[] = [];
	for (let n = 1; n <= 9; n++) {
		unregisterAltNums.push(
			registerShortcut({
				key: String(n),
				modifiers: ['alt'],
				label: `Go to Page ${n}`,
				category: 'Navigation',
				handler: () => {
					const tabs = get(pluginTabs);
					const tab = tabs[n - 1];
					if (tab) goto(tab.path);
				},
			})
		);
	}

	// F12 or Ctrl+Shift+I: toggle devtools
	const unregisterDevtools = registerShortcut({
		key: 'F12',
		modifiers: [],
		label: 'Toggle DevTools',
		category: 'Developer',
		handler: async () => {
			const { invoke } = await import('@tauri-apps/api/core');
			invoke('toggle_devtools').catch(() => {});
		},
	});
	const unregisterDevtools2 = registerShortcut({
		key: 'i',
		modifiers: ['ctrl', 'shift'],
		label: 'Toggle DevTools',
		category: 'Developer',
		handler: async () => {
			const { invoke } = await import('@tauri-apps/api/core');
			invoke('toggle_devtools').catch(() => {});
		},
	});

	onMount(() => {
		runStartupChecklist();
		updateInterval = setInterval(() => {
			checkForUpdate();
			checkPluginUpdates();
		}, 30 * 60 * 1000);
	});

	onDestroy(() => {
		stopPolling();
		stopEventStream();
		stopAppWatcher();
		stopSettingsWatcher();
		stopIdentityWatcher();
		stopTrafficWatcher();
		clearInterval(updateInterval);
		unregisterTabForward();
		unregisterTabBackward();
		unregisterAltNums.forEach((fn) => fn());
		unregisterDevtools();
		unregisterDevtools2();
	});
</script>

<svelte:window onkeydown={dispatchKeydown} />

<DaemonStartingOverlay />
<OnboardingOverlay />
<UpdateModal />
<PluginUpdateModal />
<Launcher />
<KeyboardShortcutsHelp />

<div class="flex flex-col h-screen w-screen overflow-hidden">
	<TitleBar />

	<main class="flex-1 overflow-hidden relative">
		{@render children()}
	</main>

	<StatusBar />
</div>

<ToastContainer />
