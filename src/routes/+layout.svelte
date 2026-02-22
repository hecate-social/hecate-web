<script lang="ts">
	import '../app.css';
	import TitleBar from '$lib/components/TitleBar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import DaemonStartingOverlay from '$lib/components/DaemonStartingOverlay.svelte';
	import UpdateModal from '$lib/components/UpdateModal.svelte';
	import PluginUpdateModal from '$lib/components/PluginUpdateModal.svelte';
	import { startPolling, stopPolling, onReconnect } from '$lib/stores/daemon.js';
	import { fetchModels } from '$lib/stores/llm.js';
	import { fetchIdentity, fetchProviders } from '$lib/stores/macula.js';
	import { loadPersonalityInfo } from '$lib/stores/personality.js';
	import { loadAgents } from '$lib/stores/agents.js';
	import { startPluginWatcher, stopPluginWatcher } from '$lib/stores/plugins';
	import { checkForUpdate } from '$lib/stores/updater.js';
	import { checkPluginUpdates } from '$lib/stores/pluginUpdater.js';
	import { toggleSidebar } from '$lib/stores/sidebar.js';
	import { studioPaths } from '$lib/studios';
	import '$lib/stores/theme.js';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';

	let { children } = $props();
	let updateInterval: ReturnType<typeof setInterval>;

	function refreshAllData() {
		fetchModels();
		fetchIdentity();
		fetchProviders();
		loadPersonalityInfo();
		loadAgents();
		checkForUpdate();
		checkPluginUpdates();
	}

	onMount(() => {
		onReconnect(refreshAllData);
		startPolling();
		startPluginWatcher();
		refreshAllData();
		updateInterval = setInterval(() => {
			checkForUpdate();
			checkPluginUpdates();
		}, 30 * 60 * 1000);
	});

	onDestroy(() => {
		stopPolling();
		stopPluginWatcher();
		clearInterval(updateInterval);
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		// Ctrl+B — toggle sidebar
		if (e.ctrlKey && e.key === 'b') {
			e.preventDefault();
			toggleSidebar();
			return;
		}

		// Ctrl+Tab / Ctrl+Shift+Tab — cycle studios
		if (e.ctrlKey && e.key === 'Tab') {
			e.preventDefault();
			const paths = get(studioPaths);
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
<UpdateModal />
<PluginUpdateModal />

<div class="flex flex-col h-screen w-screen overflow-hidden">
	<TitleBar />

	<div class="flex flex-1 overflow-hidden">
		<Sidebar />

		<main class="flex-1 overflow-hidden relative">
			{@render children()}
		</main>
	</div>

	<StatusBar />
</div>
