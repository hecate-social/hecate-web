<script lang="ts">
	import '../app.css';
	import StudioTabs from '$lib/components/StudioTabs.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import { startPolling, stopPolling } from '$lib/stores/daemon.js';
	import { fetchModels } from '$lib/stores/llm.js';
	import { fetchIdentity, fetchProviders } from '$lib/stores/node.js';
	import { loadPersonalityInfo } from '$lib/stores/personality.js';
	import { onMount, onDestroy } from 'svelte';

	let { children } = $props();

	onMount(() => {
		startPolling(10000);
		fetchModels();
		fetchIdentity();
		fetchProviders();
		loadPersonalityInfo();
	});

	onDestroy(() => {
		stopPolling();
	});
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden">
	<StudioTabs />

	<main class="flex-1 overflow-hidden">
		{@render children()}
	</main>

	<StatusBar />
</div>
