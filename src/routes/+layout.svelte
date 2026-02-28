<script lang="ts">
	import '../app.css';
	import TitleBar from '$lib/components/TitleBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import DaemonStartingOverlay from '$lib/components/DaemonStartingOverlay.svelte';
	import OnboardingOverlay from '$lib/components/OnboardingOverlay.svelte';
	import UpdateModal from '$lib/components/UpdateModal.svelte';
	import PluginUpdateModal from '$lib/components/PluginUpdateModal.svelte';
	import { startPolling, stopPolling, onReconnect } from '$lib/stores/daemon.js';
	import { fetchSettings, startSettingsWatcher, stopSettingsWatcher } from '$lib/stores/settings';
	import { startIdentityWatcher, stopIdentityWatcher } from '$lib/stores/nodeIdentity';
	import { startPluginWatcher, stopPluginWatcher } from '$lib/stores/plugins';
	import { checkForUpdate } from '$lib/stores/updater.js';
	import { checkPluginUpdates } from '$lib/stores/pluginUpdater.js';
	import { toggleSidebar, initSidebar, startConfigWatcher, stopConfigWatcher } from '$lib/stores/sidebar.js';
	import { startTrafficWatcher, stopTrafficWatcher } from '$lib/stores/traffic.js';
	import { pluginPaths } from '$lib/plugins-registry';
	import '$lib/stores/theme.js';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';

	let { children } = $props();
	let updateInterval: ReturnType<typeof setInterval>;
	let showAlphaBanner = $state(typeof localStorage !== 'undefined' && localStorage.getItem('hecate-alpha-banner-dismissed') !== '1');

	onMount(() => {
		startPolling();
		startPluginWatcher();
		startConfigWatcher();
		startSettingsWatcher();
		startIdentityWatcher();
		startTrafficWatcher();
		checkForUpdate();
		checkPluginUpdates();
		onReconnect(() => {
			initSidebar();
			fetchSettings();
		});
		initSidebar();
		fetchSettings();
		updateInterval = setInterval(() => {
			checkForUpdate();
			checkPluginUpdates();
		}, 30 * 60 * 1000);
	});

	onDestroy(() => {
		stopPolling();
		stopPluginWatcher();
		stopConfigWatcher();
		stopSettingsWatcher();
		stopIdentityWatcher();
		stopTrafficWatcher();
		clearInterval(updateInterval);
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		// Ctrl+B — toggle sidebar
		if (e.ctrlKey && e.key === 'b') {
			e.preventDefault();
			toggleSidebar();
			return;
		}

		// Ctrl+Tab / Ctrl+Shift+Tab — cycle pages
		if (e.ctrlKey && e.key === 'Tab') {
			e.preventDefault();
			const paths = get(pluginPaths);
			const current = page.url?.pathname ?? '/';
			const idx = paths.findIndex((p) =>
				p === '/' ? current === '/' : current.startsWith(p)
			);
			const currentIdx = idx >= 0 ? idx : 0;
			const nextIdx = e.shiftKey
				? (currentIdx - 1 + paths.length) % paths.length
				: (currentIdx + 1) % paths.length;
			goto(paths[nextIdx]);
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<DaemonStartingOverlay />
<OnboardingOverlay />
<UpdateModal />
<PluginUpdateModal />

<div class="flex flex-col h-screen w-screen overflow-hidden">
	<TitleBar />

	{#if showAlphaBanner}
		<div class="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-xs text-surface-300 flex items-center justify-between shrink-0">
			<div class="flex items-center gap-2">
				<svg class="size-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
				</svg>
				<span>
					<strong class="text-amber-400">Alpha Preview</strong> — Under active development. Expect rough edges and breaking changes.
				</span>
			</div>
			<button
				onclick={() => { showAlphaBanner = false; localStorage.setItem('hecate-alpha-banner-dismissed', '1'); }}
				class="p-0.5 rounded hover:bg-surface-700 transition-colors"
				aria-label="Dismiss"
			>
				<svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<Sidebar />

		<main class="flex-1 overflow-hidden relative">
			{@render children()}
		</main>
	</div>

	<StatusBar />
</div>
