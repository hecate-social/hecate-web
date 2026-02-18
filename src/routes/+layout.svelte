<script lang="ts">
	import '../app.css';
	import StudioTabs from '$lib/components/StudioTabs.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import DaemonStartingOverlay from '$lib/components/DaemonStartingOverlay.svelte';
	import { startPolling, stopPolling } from '$lib/stores/daemon.js';
	import { fetchModels } from '$lib/stores/llm.js';
	import { fetchIdentity, fetchProviders } from '$lib/stores/node.js';
	import { loadPersonalityInfo } from '$lib/stores/personality.js';
	import { loadAgents } from '$lib/stores/agents.js';
	import { startPluginPolling, stopPluginPolling } from '$lib/stores/plugins';
	import { studioPaths } from '$lib/studios';
	import '$lib/stores/theme.js';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';

	let { children } = $props();

	onMount(() => {
		startPolling();
		startPluginPolling();
		fetchModels();
		fetchIdentity();
		fetchProviders();
		loadPersonalityInfo();
		loadAgents();
	});

	onDestroy(() => {
		stopPolling();
		stopPluginPolling();
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
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

<div class="flex flex-col h-screen w-screen overflow-hidden">
	<StudioTabs />

	<main class="flex-1 overflow-hidden">
		{@render children()}
	</main>

	<StatusBar />
</div>
