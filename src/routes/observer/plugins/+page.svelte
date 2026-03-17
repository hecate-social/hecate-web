<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchPlugins, type PluginInfo } from '$lib/stores/observer';

	let plugins = $state<PluginInfo[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function refresh() {
		try {
			const data = await fetchPlugins();
			plugins = data.items;
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
			<h2 class="text-sm font-semibold text-surface-100">Loaded Plugins</h2>
			<span class="text-xs text-surface-500">{plugins.length} plugins</span>
		</div>
		<button onclick={refresh} class="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-surface-400 hover:text-surface-200 cursor-pointer">Refresh</button>
	</div>

	{#if loading}
		<div class="text-center text-surface-400 py-10 text-sm">Loading...</div>
	{:else if error}
		<div class="text-center text-danger-400 py-10 text-sm">{error}</div>
	{:else if plugins.length === 0}
		<div class="text-center text-surface-500 py-10 text-sm">No plugins loaded</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each plugins as plugin}
				<div class="rounded-xl border border-surface-600 bg-surface-800/80 p-5 space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold text-surface-100">{plugin.name}</span>
						<span class="px-2 py-0.5 rounded-full text-[10px] font-medium
							{plugin.health === 'ok' ? 'bg-success-400/15 text-success-400' :
							 plugin.health === 'degraded' ? 'bg-warning-400/15 text-warning-400' :
							 'bg-surface-700 text-surface-400'}">
							{plugin.health}
						</span>
					</div>
					<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
						{#if plugin.version}
							<span class="text-surface-500">Version</span>
							<span class="text-surface-200">{plugin.version}</span>
						{/if}
						{#if plugin.callback_module}
							<span class="text-surface-500">Module</span>
							<span class="text-surface-200 font-mono">{plugin.callback_module}</span>
						{/if}
						{#if plugin.store_id}
							<span class="text-surface-500">Store</span>
							<span class="text-surface-200 font-mono">{plugin.store_id}</span>
						{/if}
						<span class="text-surface-500">Frontend</span>
						<span class="text-surface-200">{plugin.has_frontend ? 'yes' : 'no'}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
