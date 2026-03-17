<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import EventViewer from '$lib/components/observer/EventViewer.svelte';
	import { fetchStreamEvents, type EventRecord } from '$lib/stores/observer';

	let events = $state<EventRecord[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let offset = $state(0);
	let limit = 50;
	let direction = $state<'forward' | 'backward'>('forward');

	const params = $derived($page.params as Record<string, string>);
	const storeId = $derived(params.storeId);
	const streamId = $derived(decodeURIComponent(params.streamId));

	async function refresh() {
		loading = true;
		try {
			const data = await fetchStreamEvents(storeId, streamId, offset, limit, direction);
			events = data.items;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	onMount(refresh);
</script>

<div class="p-6 space-y-4">
	<div class="flex items-center gap-3 flex-wrap">
		<a href="/observer/stores/{storeId}" class="text-xs text-accent-400 hover:text-accent-300">{'\u2190'} {storeId}</a>
		<h2 class="text-sm font-semibold text-surface-100 font-mono break-all">{streamId}</h2>
	</div>

	<!-- Controls -->
	<div class="flex items-center gap-2">
		<select
			bind:value={direction}
			onchange={refresh}
			class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-200 focus:outline-none cursor-pointer"
		>
			<option value="forward">Forward (oldest first)</option>
			<option value="backward">Backward (newest first)</option>
		</select>
		<div class="flex gap-1 ml-auto">
			<button
				onclick={() => { offset = Math.max(0, offset - limit); refresh(); }}
				disabled={offset === 0}
				class="px-2 py-1 rounded bg-surface-700 text-xs text-surface-400 disabled:opacity-30 cursor-pointer"
			>{'\u2190'}</button>
			<span class="text-xs text-surface-500 px-2 py-1">offset: {offset}</span>
			<button
				onclick={() => { offset += limit; refresh(); }}
				disabled={events.length < limit}
				class="px-2 py-1 rounded bg-surface-700 text-xs text-surface-400 disabled:opacity-30 cursor-pointer"
			>{'\u2192'}</button>
		</div>
	</div>

	{#if loading && events.length === 0}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else}
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 overflow-hidden max-h-[calc(100vh-280px)] overflow-y-auto">
			{#each events as event}
				<EventViewer {event} />
			{/each}
			{#if events.length === 0}
				<div class="text-center text-surface-500 py-8 text-xs">No events in this stream</div>
			{/if}
		</div>
	{/if}
</div>
