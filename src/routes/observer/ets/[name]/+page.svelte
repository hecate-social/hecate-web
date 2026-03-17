<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import TermDisplay from '$lib/components/observer/TermDisplay.svelte';
	import { fetchEtsTableContent, type EtsRow } from '$lib/stores/observer';

	let rows = $state<EtsRow[]>([]);
	let total = $state(0);
	let tableInfo = $state<{ name: string; type: string; size: number; protection: string } | null>(null);
	let offset = $state(0);
	let limit = 50;
	let loading = $state(true);
	let error = $state<string | null>(null);

	const name = $derived(($page.params as Record<string, string>).name ?? '');

	async function refresh() {
		try {
			const data = await fetchEtsTableContent(name, limit, offset);
			rows = data.items;
			total = data.total;
			tableInfo = data.table;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	function prevPage() {
		if (offset > 0) {
			offset = Math.max(0, offset - limit);
			refresh();
		}
	}

	function nextPage() {
		if (offset + limit < total) {
			offset += limit;
			refresh();
		}
	}

	onMount(refresh);
</script>

<div class="p-6 space-y-4">
	<div class="flex items-center gap-3">
		<a href="/observer/ets" class="text-xs text-accent-400 hover:text-accent-300">{'\u2190'} ETS Tables</a>
		<h2 class="text-sm font-semibold text-surface-100 font-mono">{name}</h2>
		{#if tableInfo}
			<span class="text-xs text-surface-500">{tableInfo.size.toLocaleString()} rows | {tableInfo.type} | {tableInfo.protection}</span>
		{/if}
	</div>

	<!-- Pagination -->
	<div class="flex items-center justify-between">
		<span class="text-xs text-surface-500">{offset + 1} - {Math.min(offset + limit, total)} of {total}</span>
		<div class="flex gap-2">
			<button onclick={prevPage} disabled={offset === 0} class="px-3 py-1 rounded bg-surface-700 text-xs text-surface-400 disabled:opacity-30 cursor-pointer">{'\u2190'} Prev</button>
			<button onclick={refresh} class="px-3 py-1 rounded bg-surface-700 text-xs text-surface-400 cursor-pointer">Refresh</button>
			<button onclick={nextPage} disabled={offset + limit >= total} class="px-3 py-1 rounded bg-surface-700 text-xs text-surface-400 disabled:opacity-30 cursor-pointer">Next {'\u2192'}</button>
		</div>
	</div>

	{#if loading && rows.length === 0}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else}
		<div class="max-h-[calc(100vh-240px)] overflow-y-auto space-y-2">
			{#each rows as row, i}
				<div class="rounded-lg border border-surface-600 bg-surface-800/80 p-4">
					<div class="flex items-baseline gap-3 mb-2">
						<span class="text-xs text-surface-500 shrink-0">#{offset + i + 1}</span>
						<div class="flex items-baseline gap-2">
							<span class="text-xs text-surface-500 shrink-0">key:</span>
							<TermDisplay value={row.key} />
						</div>
					</div>
					{#if row.values.length > 0}
						<div class="ml-6 space-y-1">
							{#each row.values as val, vi}
								<div class="flex items-baseline gap-2">
									<span class="text-xs text-surface-500 shrink-0">v{vi}:</span>
									<div class="min-w-0"><TermDisplay value={val} /></div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
			{#if rows.length === 0}
				<div class="text-center text-surface-500 py-8 text-xs">Empty table</div>
			{/if}
		</div>
	{/if}
</div>
