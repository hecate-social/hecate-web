<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import EventViewer from '$lib/components/observer/EventViewer.svelte';
	import {
		fetchStores,
		fetchStoreStreams,
		fetchStoreEvents,
		fetchSubscriptions,
		fetchStoreSnapshots,
		fetchStoreSubscriptionDetails,
		type StoreInfo,
		type StreamInfo,
		type EventRecord,
		type SubscriptionGroup,
		type SnapshotInfo,
		type StoreSubscriptionInfo
	} from '$lib/stores/observer';

	let storeInfo = $state<StoreInfo | null>(null);
	let streams = $state<StreamInfo[]>([]);
	let events = $state<EventRecord[]>([]);
	let subscriptions = $state<SubscriptionGroup[]>([]);
	let snapshots = $state<SnapshotInfo[]>([]);
	let storeSubs = $state<StoreSubscriptionInfo[]>([]);
	let loading = $state(true);
	let eventsLoading = $state(false);
	let snapshotsLoading = $state(false);
	let storeSubsLoading = $state(false);
	let error = $state<string | null>(null);
	let activeTab = $state<'overview' | 'streams' | 'snapshots' | 'subscriptions' | 'all'>('overview');
	let eventOffset = $state(0);
	let eventLimit = 50;
	let typeFilter = $state('');

	const storeId = $derived(($page.params as Record<string, string>).storeId);

	let storeSubscriptions = $derived(
		subscriptions.filter((s) =>
			s.group.includes(storeId) || s.group.includes(storeId.replace('_store', ''))
		)
	);

	let totalEvents = $derived(streams.reduce((sum, s) => sum + s.event_count, 0));
	let totalStreams = $derived(streams.length);

	async function refreshAll() {
		loading = true;
		try {
			const [storesRes, streamsRes, subsRes] = await Promise.all([
				fetchStores(),
				fetchStoreStreams(storeId),
				fetchSubscriptions()
			]);
			storeInfo = storesRes.items.find((s) => s.store_id === storeId) ?? null;
			streams = streamsRes.items;
			subscriptions = subsRes.items;
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

	async function refreshSnapshots() {
		snapshotsLoading = true;
		try {
			const data = await fetchStoreSnapshots(storeId);
			snapshots = data.items;
		} catch { /* ignore */ }
		finally { snapshotsLoading = false; }
	}

	async function refreshStoreSubs() {
		storeSubsLoading = true;
		try {
			const data = await fetchStoreSubscriptionDetails(storeId);
			storeSubs = data.items;
		} catch { /* ignore */ }
		finally { storeSubsLoading = false; }
	}

	function switchTab(tab: typeof activeTab) {
		activeTab = tab;
		if (tab === 'all' && events.length === 0) refreshEvents();
		if (tab === 'snapshots' && snapshots.length === 0) refreshSnapshots();
		if (tab === 'subscriptions' && storeSubs.length === 0) refreshStoreSubs();
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	onMount(refreshAll);
</script>

<div class="p-6 space-y-4">
	<div class="flex items-center gap-3">
		<a href="/observer/stores" class="text-xs text-accent-400 hover:text-accent-300">{'\u2190'} Stores</a>
		<h2 class="text-sm font-semibold text-surface-100 font-mono">{storeId}</h2>
		{#if storeInfo}
			<span class="inline-flex items-center gap-1.5 text-[10px]">
				<span class="size-1.5 rounded-full {storeInfo.running ? 'bg-health-ok' : 'bg-health-err'}"></span>
				<span class="text-surface-500">{storeInfo.running ? 'Running' : 'Stopped'}</span>
			</span>
		{/if}
	</div>

	<!-- Tab switcher -->
	<div class="flex gap-1">
		<button
			onclick={() => switchTab('overview')}
			class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer
				{activeTab === 'overview' ? 'bg-accent-600/20 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
		>Overview</button>
		<button
			onclick={() => switchTab('streams')}
			class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer
				{activeTab === 'streams' ? 'bg-accent-600/20 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
		>Streams ({totalStreams})</button>
		<button
			onclick={() => switchTab('snapshots')}
			class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer
				{activeTab === 'snapshots' ? 'bg-accent-600/20 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
		>Snapshots</button>
		<button
			onclick={() => switchTab('subscriptions')}
			class="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer
				{activeTab === 'subscriptions' ? 'bg-accent-600/20 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
		>Subscriptions</button>
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
	{:else if activeTab === 'overview'}
		<!-- Overview Tab -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Store Stats -->
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-3">
				<h3 class="text-[10px] uppercase tracking-wider text-surface-500">Store</h3>
				<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
					<span class="text-surface-500">Store ID</span>
					<span class="text-surface-200 font-mono">{storeId}</span>
					<span class="text-surface-500">Status</span>
					<span class="text-surface-200 flex items-center gap-1.5">
						<span class="size-1.5 rounded-full {storeInfo?.running ? 'bg-health-ok' : 'bg-health-err'}"></span>
						{storeInfo?.running ? 'Running' : 'Stopped'}
					</span>
					<span class="text-surface-500">Streams</span>
					<span class="text-surface-200">{totalStreams}</span>
					<span class="text-surface-500">Total Events</span>
					<span class="text-surface-200">{totalEvents}</span>
				</div>
			</div>

			<!-- ETS Tables -->
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-3">
				<h3 class="text-[10px] uppercase tracking-wider text-surface-500">ETS Projection Tables</h3>
				{#if storeInfo?.ets_tables && storeInfo.ets_tables.length > 0}
					<div class="space-y-2">
						{#each storeInfo.ets_tables as table}
							<div class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700/50">
								<span class="text-xs text-accent-400 font-mono">{table.name}</span>
								<div class="flex items-center gap-3 text-[10px] text-surface-500">
									<span>{table.size} rows</span>
									<span>{formatBytes(table.memory_bytes)}</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-xs text-surface-500">No ETS tables found</div>
				{/if}
			</div>

			<!-- Subscriptions -->
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-3 lg:col-span-2">
				<h3 class="text-[10px] uppercase tracking-wider text-surface-500">
					Subscriptions ({storeSubscriptions.length})
				</h3>
				{#if storeSubscriptions.length > 0}
					<div class="space-y-2">
						{#each storeSubscriptions as sub}
							<div class="px-3 py-2 rounded-lg bg-surface-900/50 border border-surface-700/50">
								<div class="flex items-center justify-between">
									<span class="text-xs text-surface-200 font-mono">{sub.group}</span>
									<span class="text-[10px] text-surface-500">{sub.member_count} member{sub.member_count !== 1 ? 's' : ''}</span>
								</div>
								{#if sub.members.length > 0}
									<div class="mt-1.5 space-y-0.5">
										{#each sub.members as member}
											<div class="flex items-center gap-2 text-[10px]">
												<span class="size-1.5 rounded-full {member.alive ? 'bg-health-ok' : 'bg-health-err'}"></span>
												<span class="text-surface-400 font-mono">{member.pid}</span>
												{#if member.registered_name}
													<span class="text-surface-300">{member.registered_name}</span>
												{:else if member.initial_call}
													<span class="text-surface-500">{member.initial_call}</span>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-xs text-surface-500">No subscriptions found for this store</div>
				{/if}
			</div>

			<!-- Top Streams -->
			{#if streams.length > 0}
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-3 lg:col-span-2">
					<h3 class="text-[10px] uppercase tracking-wider text-surface-500">
						Top Streams by Event Count
					</h3>
					<div class="space-y-1">
						{#each [...streams].sort((a, b) => b.event_count - a.event_count).slice(0, 10) as stream}
							<button
								onclick={() => goto(`/observer/stores/${storeId}/${encodeURIComponent(stream.stream_id)}`)}
								class="flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-surface-700/50 cursor-pointer text-left transition-colors"
							>
								<span class="text-xs text-accent-400 font-mono truncate">{stream.stream_id}</span>
								<div class="flex items-center gap-3 text-[10px] text-surface-500 shrink-0">
									<span>v{stream.version}</span>
									<span>{stream.event_count} events</span>
								</div>
							</button>
						{/each}
					</div>
					{#if streams.length > 10}
						<button
							onclick={() => switchTab('streams')}
							class="text-[10px] text-accent-400 hover:text-accent-300 cursor-pointer"
						>
							View all {streams.length} streams {'\u2192'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
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
	{:else if activeTab === 'snapshots'}
		<!-- Snapshots -->
		{#if snapshotsLoading}
			<div class="text-center text-surface-400 py-10 text-sm">Loading snapshots...</div>
		{:else if snapshots.length === 0}
			<div class="text-center text-surface-500 py-10 text-xs">No snapshots in this store</div>
		{:else}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 overflow-hidden">
				<table class="w-full text-xs">
					<thead>
						<tr>
							<th class="text-left px-4 py-2 border-b border-surface-600 text-surface-500">Stream ID</th>
							<th class="text-right px-4 py-2 border-b border-surface-600 text-surface-500">Version</th>
							<th class="text-right px-4 py-2 border-b border-surface-600 text-surface-500">Timestamp</th>
						</tr>
					</thead>
					<tbody>
						{#each snapshots as snap}
							<tr class="hover:bg-surface-700/30 cursor-pointer"
								onclick={() => goto(`/observer/stores/${storeId}/${encodeURIComponent(snap.stream_id)}`)}
							>
								<td class="px-4 py-2 font-mono text-accent-400 border-b border-surface-600/30">{snap.stream_id}</td>
								<td class="px-4 py-2 text-right text-surface-200 border-b border-surface-600/30">{snap.version}</td>
								<td class="px-4 py-2 text-right text-surface-400 border-b border-surface-600/30">
									{snap.timestamp ? new Date(snap.timestamp).toLocaleString() : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else if activeTab === 'subscriptions'}
		<!-- Store Subscriptions -->
		{#if storeSubsLoading}
			<div class="text-center text-surface-400 py-10 text-sm">Loading subscriptions...</div>
		{:else if storeSubs.length === 0}
			<div class="text-center text-surface-500 py-10 text-xs">No subscriptions for this store</div>
		{:else}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 overflow-hidden">
				<table class="w-full text-xs">
					<thead>
						<tr>
							<th class="text-left px-4 py-2 border-b border-surface-600 text-surface-500">Name</th>
							<th class="text-left px-4 py-2 border-b border-surface-600 text-surface-500">Type</th>
							<th class="text-left px-4 py-2 border-b border-surface-600 text-surface-500">Selector</th>
							<th class="text-right px-4 py-2 border-b border-surface-600 text-surface-500">Checkpoint</th>
							<th class="text-right px-4 py-2 border-b border-surface-600 text-surface-500">Pool</th>
							<th class="text-left px-4 py-2 border-b border-surface-600 text-surface-500">PID</th>
						</tr>
					</thead>
					<tbody>
						{#each storeSubs as sub}
							<tr class="hover:bg-surface-700/30">
								<td class="px-4 py-2 font-mono text-accent-400 border-b border-surface-600/30">{sub.subscription_name}</td>
								<td class="px-4 py-2 text-surface-300 border-b border-surface-600/30">{sub.type}</td>
								<td class="px-4 py-2 font-mono text-surface-400 border-b border-surface-600/30 truncate max-w-[200px]">{sub.selector}</td>
								<td class="px-4 py-2 text-right text-surface-200 border-b border-surface-600/30">{sub.checkpoint ?? '—'}</td>
								<td class="px-4 py-2 text-right text-surface-200 border-b border-surface-600/30">{sub.pool_size}</td>
								<td class="px-4 py-2 font-mono text-surface-500 border-b border-surface-600/30">{sub.subscriber_pid}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
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
