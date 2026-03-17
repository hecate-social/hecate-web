<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fetchMeshStatus, type MeshStatus } from '$lib/stores/mesh';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let status = $state<MeshStatus | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let nodeIdExpanded = $state(false);

	async function refresh() {
		try {
			status = await fetchMeshStatus();
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	function truncateId(id: string | null): string {
		if (!id) return '--';
		if (id.length <= 16) return id;
		return id.slice(0, 8) + '...' + id.slice(-8);
	}

	onMount(async () => {
		await refresh();
		pollTimer = setInterval(refresh, 5000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<div class="p-6 max-w-4xl space-y-6">
	{#if loading && !status}
		<div class="flex items-center justify-center py-20">
			<div class="text-center text-surface-400">
				<div class="text-2xl mb-2 animate-pulse">{'\uD83C\uDF10'}</div>
				<div class="text-sm">Loading mesh status...</div>
			</div>
		</div>
	{:else if error && !status}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="text-2xl mb-2">{'\u{26A0}'}</div>
			<div class="text-sm text-danger-400">{error}</div>
			<button onclick={refresh} class="mt-4 px-4 py-2 rounded-lg text-xs bg-accent-600 text-surface-50 hover:bg-accent-500 cursor-pointer">Retry</button>
		</div>
	{:else if status}
		<!-- Connection Status -->
		<div class="rounded-xl border bg-surface-800/80 p-5 {status.connected ? 'border-green-600/50' : 'border-danger-600/50'}">
			<div class="flex items-center gap-4">
				<div class="size-4 rounded-full shrink-0 {status.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-danger-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}"></div>
				<div>
					<div class="text-lg font-semibold {status.connected ? 'text-green-400' : 'text-danger-400'}">
						{status.connected ? 'Connected' : 'Disconnected'}
					</div>
					<div class="text-xs text-surface-500">
						{status.connected ? 'Mesh network is active' : 'Not connected to the mesh network'}
					</div>
				</div>
			</div>
		</div>

		<!-- Node Info -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Node Information</h2>
			<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
				<span class="text-surface-500">Node ID</span>
				<button
					onclick={() => { nodeIdExpanded = !nodeIdExpanded; }}
					class="text-left text-surface-200 font-mono text-xs cursor-pointer hover:text-accent-400 transition-colors"
					title={status.node_id ?? 'Not assigned'}
				>
					{nodeIdExpanded ? (status.node_id ?? '--') : truncateId(status.node_id)}
				</button>

				<span class="text-surface-500">Realm</span>
				<span class="text-surface-200">{status.realm || '--'}</span>

				<span class="text-surface-500">Identity</span>
				<span class="text-surface-200 font-mono text-xs">{status.identity || '--'}</span>
			</div>
		</div>

		<!-- Bootstrap Servers -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">Bootstrap Servers</h2>
			{#if status.bootstrap.length === 0}
				<div class="text-sm text-surface-500">No bootstrap servers configured</div>
			{:else}
				<div class="flex flex-wrap gap-2">
					{#each status.bootstrap as server}
						<span class="px-3 py-1.5 rounded-lg bg-surface-700 text-xs text-surface-200 font-mono">
							{server}
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Active Subscriptions -->
		<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-4">
			<h2 class="text-xs font-semibold text-surface-300 uppercase tracking-wider">
				Active Subscriptions
				{#if status.subscriptions.length > 0}
					<span class="ml-2 text-surface-500 normal-case tracking-normal font-normal">({status.subscriptions.length})</span>
				{/if}
			</h2>
			{#if status.subscriptions.length === 0}
				<div class="text-sm text-surface-500">No active subscriptions</div>
			{:else}
				<div class="flex flex-wrap gap-2">
					{#each status.subscriptions as topic}
						<span class="px-3 py-1.5 rounded-lg bg-surface-700 text-xs text-surface-200 font-mono">
							{topic}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
