<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import EventViewer from '$lib/components/observer/EventViewer.svelte';
	import {
		fetchStoreStreams,
		fetchStoreEvents,
		type StreamInfo,
		type EventRecord
	} from '$lib/stores/observer';

	let streams = $state<StreamInfo[]>([]);
	let events = $state<EventRecord[]>([]);
	let loading = $state(true);
	let eventsLoading = $state(false);
	let error = $state<string | null>(null);
	let activeTab = $state<'streams' | 'all'>('streams');
	let eventOffset = $state(0);
	let eventLimit = 50;
	let typeFilter = $state('');

	const storeId = $derived(($page.params as Record<string, string>).storeId);

	async function refreshStreams() {
		try {
			const data = await fetchStoreStreams(storeId);
			streams = data.items;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	async function refreshEvents() {
		eventsLoading = true;
		try {
			const data = await fetchStoreEvents(storeId, eventOffset, eventLimit, typeFilter || undefined);
			events = data.items;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			eventsLoading = false;
		}
	}

	function switchTab(tab: 'streams' | 'all') {
		activeTab = tab;
		if (tab === 'all' && events.length === 0) refreshEvents();
	}

	onMount(refreshStreams);
</script>

<div class="p-6 space-y-4">
	<div class="flex items-center gap-3">
		<a href="/observer/stores" class="text-xs text-accent-400 hover:text-accent-300">{'\u2190'} Stores</a>
		<h2 class="text-sm font-semibold text-surface-100 font-mono">{storeId}</h2>
	</div>

	<!-- Tab switcher -->
	<div class="flex gap-1">
		<button
			onclick={() => switchTab('streams')}
			class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer
				{activeTab === 'streams' ? 'bg-accent-600/20 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
		>Streams ({streams.length})</button>
		<button
			onclick={() => switchTab('all')}
			class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer
				{activeTab === 'all' ? 'bg-accent-600/20 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
		>$all Events</button>
	</div>

	{#if loading}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else if activeTab === 'streams'}
		<!-- Stream List -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 overflow-hidden">
			<table class="w-full text-xs">
				<thead>
					<tr>
						<th class="text-left px-4 py-2 border-b border-surface-600 text-surface-500">Stream ID</th>
						<th class="text-right px-4 py-2 border-b border-surface-600 text-surface-500">Version</th>
						<th class="text-right px-4 py-2 border-b border-surface-600 text-surface-500">Events</th>
					</tr>
				</thead>
				<tbody>
					{#each streams as stream}
						<tr
							class="hover:bg-surface-700/30 cursor-pointer"
							onclick={() => goto(`/observer/stores/${storeId}/${encodeURIComponent(stream.stream_id)}`)}
						>
							<td class="px-4 py-2 font-mono text-accent-400 border-b border-surface-600/30">{stream.stream_id}</td>
							<td class="px-4 py-2 text-right text-surface-200 border-b border-surface-600/30">{stream.version}</td>
							<td class="px-4 py-2 text-right text-surface-200 border-b border-surface-600/30">{stream.event_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if streams.length === 0}
				<div class="text-center text-surface-500 py-8 text-xs">No streams in this store</div>
			{/if}
		</div>
	{:else}
		<!-- $all Event Log -->
		<div class="flex items-center gap-2 mb-2">
			<input
				type="text"
				placeholder="Filter by event type..."
				bind:value={typeFilter}
				class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-200 placeholder:text-surface-500 w-64 font-mono focus:outline-none focus:border-accent-500"
			/>
			<button onclick={refreshEvents} class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-400 hover:text-surface-200 cursor-pointer">
				{eventsLoading ? 'Loading...' : 'Fetch'}
			</button>
			<div class="flex gap-1 ml-auto">
				<button
					onclick={() => { eventOffset = Math.max(0, eventOffset - eventLimit); refreshEvents(); }}
					disabled={eventOffset === 0}
					class="px-2 py-1 rounded bg-surface-700 text-xs text-surface-400 disabled:opacity-30 cursor-pointer"
				>{'\u2190'}</button>
				<span class="text-xs text-surface-500 px-2 py-1">offset: {eventOffset}</span>
				<button
					onclick={() => { eventOffset += eventLimit; refreshEvents(); }}
					disabled={events.length < eventLimit}
					class="px-2 py-1 rounded bg-surface-700 text-xs text-surface-400 disabled:opacity-30 cursor-pointer"
				>{'\u2192'}</button>
			</div>
		</div>
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 overflow-hidden max-h-[calc(100vh-300px)] overflow-y-auto">
			{#each events as event}
				<EventViewer {event} />
			{/each}
			{#if events.length === 0}
				<div class="text-center text-surface-500 py-8 text-xs">No events found</div>
			{/if}
		</div>
	{/if}
</div>
