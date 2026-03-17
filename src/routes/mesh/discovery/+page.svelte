<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fetchMeshStatus, discoverSubscribers, type MeshSubscriber, type MeshStatus } from '$lib/stores/mesh';

	let topic = $state('');
	let subscribers = $state<MeshSubscriber[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let error = $state<string | null>(null);
	let meshStatus = $state<MeshStatus | null>(null);
	let statusLoading = $state(true);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	async function refreshStatus() {
		try {
			meshStatus = await fetchMeshStatus();
		} catch {
			// ignore — we show disconnected state
		} finally {
			statusLoading = false;
		}
	}

	async function discover() {
		const trimmed = topic.trim();
		if (!trimmed) return;

		searching = true;
		error = null;
		subscribers = [];

		try {
			const result = await discoverSubscribers(trimmed);
			subscribers = result.subscribers;
			searched = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Discovery failed';
			searched = true;
		} finally {
			searching = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') discover();
	}

	function truncateId(id: string): string {
		if (id.length <= 16) return id;
		return id.slice(0, 8) + '...' + id.slice(-8);
	}

	onMount(async () => {
		await refreshStatus();
		pollTimer = setInterval(refreshStatus, 5000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<div class="p-6 max-w-4xl space-y-6">
	{#if statusLoading}
		<div class="flex items-center justify-center py-20">
			<div class="text-center text-surface-400">
				<div class="text-2xl mb-2 animate-pulse">{'\uD83C\uDF10'}</div>
				<div class="text-sm">Checking mesh connection...</div>
			</div>
		</div>
	{:else if meshStatus && !meshStatus.connected}
		<!-- Disconnected state -->
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="size-4 rounded-full bg-danger-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] mb-4"></div>
			<div class="text-lg font-semibold text-danger-400 mb-1">Mesh Disconnected</div>
			<div class="text-sm text-surface-500">Discovery requires an active mesh connection.</div>
		</div>
	{:else}
		<!-- Search -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Discover Subscribers</h2>
			<div class="flex gap-3">
				<input
					type="text"
					bind:value={topic}
					onkeydown={handleKeydown}
					placeholder="Enter topic name (e.g. marketplace.app_available)"
					class="flex-1 px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-sm text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent-500 font-mono"
				/>
				<button
					onclick={discover}
					disabled={searching || !topic.trim()}
					class="px-4 py-2 rounded-lg text-xs font-medium bg-accent-600 text-surface-50 hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
				>
					{#if searching}
						Searching...
					{:else}
						Discover
					{/if}
				</button>
			</div>
		</div>

		<!-- Results -->
		{#if error}
			<div class="rounded-xl border border-danger-600/50 bg-surface-800/80 p-5">
				<div class="text-sm text-danger-400">{error}</div>
			</div>
		{:else if searching}
			<div class="flex items-center justify-center py-12">
				<div class="text-center text-surface-400">
					<div class="text-xl mb-2 animate-spin">*</div>
					<div class="text-sm">Discovering subscribers...</div>
				</div>
			</div>
		{:else if searched && subscribers.length === 0}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5">
				<div class="text-center py-8">
					<div class="text-sm text-surface-500">No subscribers found for this topic</div>
				</div>
			</div>
		{:else if searched && subscribers.length > 0}
			<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
				<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">
					Subscribers
					<span class="ml-2 text-surface-500 normal-case tracking-normal font-normal">({subscribers.length})</span>
				</h2>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-surface-700">
								<th class="text-left text-xs font-medium text-surface-500 uppercase tracking-wider pb-3 pr-6">Node ID</th>
								<th class="text-left text-xs font-medium text-surface-500 uppercase tracking-wider pb-3">Endpoint</th>
							</tr>
						</thead>
						<tbody>
							{#each subscribers as sub}
								<tr class="border-b border-surface-700/50">
									<td class="py-3 pr-6 font-mono text-xs text-surface-200" title={sub.node_id}>{truncateId(sub.node_id)}</td>
									<td class="py-3 font-mono text-xs text-surface-300">{sub.endpoint}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}
</div>
