<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fetchEtsTables, type EtsTable } from '$lib/stores/observer';

	let tables = $state<EtsTable[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	const filtered = $derived(
		searchQuery
			? tables.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
			: tables
	);

	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	async function refresh() {
		try {
			const data = await fetchEtsTables();
			tables = data.items;
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
			<h2 class="text-sm font-semibold text-surface-100">ETS Tables</h2>
			<span class="text-xs text-surface-500">{tables.length} tables</span>
		</div>
		<div class="flex gap-2">
			<input
				type="text"
				placeholder="Search tables..."
				bind:value={searchQuery}
				class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-200 placeholder:text-surface-500 w-48 focus:outline-none focus:border-accent-500"
			/>
			<button onclick={refresh} class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-400 hover:text-surface-200 cursor-pointer">Refresh</button>
		</div>
	</div>

	{#if loading}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each filtered as table}
				<button
					onclick={() => table.named_table && goto(`/observer/ets/${table.name}`)}
					class="text-left rounded-xl border border-surface-600 bg-surface-800/80 p-4 hover:border-accent-500/30 transition-colors cursor-pointer"
				>
					<div class="font-mono text-xs text-accent-400 mb-2 truncate">{table.name}</div>
					<div class="flex items-center gap-4 text-xs text-surface-400">
						<span>{table.size.toLocaleString()} rows</span>
						<span>{formatBytes(table.memory_bytes)}</span>
						<span class="px-1.5 py-0.5 rounded bg-surface-700 text-surface-500">{table.type}</span>
					</div>
					<div class="text-[10px] text-surface-500 mt-1">{table.protection}</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
