<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fetchStores, type StoreInfo } from '$lib/stores/observer';

	let stores = $state<StoreInfo[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	async function refresh() {
		try {
			const data = await fetchStores();
			stores = data.items;
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
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-surface-100">Event Stores</h2>
			<span class="text-xs text-surface-500">{stores.length} stores</span>
		</div>
		<button onclick={refresh} class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-400 hover:text-surface-200 cursor-pointer">Refresh</button>
	</div>

	{#if loading}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each stores as store}
				<button
					onclick={() => goto(`/observer/stores/${store.store_id}`)}
					class="text-left rounded-xl border border-surface-600 bg-surface-800/80 p-5 hover:border-accent-500/30 transition-colors cursor-pointer space-y-3"
				>
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold text-surface-100 font-mono">{store.store_id}</span>
						<span class="inline-block w-2 h-2 rounded-full {store.running ? 'bg-success-400' : 'bg-danger-400'}"></span>
					</div>
					<div class="flex items-center gap-4 text-xs text-surface-400">
						<span>{store.stream_count} streams</span>
						<span>{store.has_events ? 'has events' : 'empty'}</span>
					</div>
					{#if store.ets_tables.length > 0}
						<div class="space-y-1">
							{#each store.ets_tables as ets}
								<div class="flex items-center justify-between text-[10px] text-surface-500">
									<span class="font-mono">{ets.name}</span>
									<span>{ets.size} rows | {formatBytes(ets.memory_bytes)}</span>
								</div>
							{/each}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
