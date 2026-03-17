<script lang="ts">
	import { onMount } from 'svelte';
	import SupervisionNode from '$lib/components/observer/SupervisionNode.svelte';
	import { fetchSupervisionTree, type SupervisionNode as SupNode } from '$lib/stores/observer';

	let tree = $state<SupNode | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let rootName = $state('hecate_sup');

	async function refresh() {
		loading = true;
		try {
			const data = await fetchSupervisionTree(rootName);
			tree = data.tree;
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
		<h2 class="text-sm font-semibold text-surface-100">Supervision Tree</h2>
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={rootName}
				class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-200 font-mono w-40 focus:outline-none focus:border-accent-500"
			/>
			<button onclick={refresh} class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-400 hover:text-surface-200 cursor-pointer">Refresh</button>
		</div>
	</div>

	{#if loading && !tree}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else if tree}
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 overflow-x-auto">
			<SupervisionNode node={tree} />
		</div>
	{/if}
</div>
