<script lang="ts">
	import { page } from '$app/state';
	import { plugins } from '$lib/stores/plugins';
	import { onDestroy } from 'svelte';

	const pluginName = $derived(page.params?.name ?? '');
	const plugin = $derived($plugins.get(pluginName));

	let container: HTMLElement | undefined = $state();
	let mountedElement: HTMLElement | null = null;
	let mountedFor: string | null = null;

	$effect(() => {
		// Cleanup previous if plugin changed
		if (mountedElement && mountedFor !== pluginName) {
			mountedElement.remove();
			mountedElement = null;
			mountedFor = null;
		}

		// Create custom element
		if (plugin?.tag && container && !mountedElement) {
			const el = document.createElement(plugin.tag);
			(el as any).api = plugin.api;
			container.appendChild(el);
			mountedElement = el;
			mountedFor = pluginName;
		}
	});

	onDestroy(() => {
		if (mountedElement) {
			mountedElement.remove();
			mountedElement = null;
			mountedFor = null;
		}
	});
</script>

{#if !plugin}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F50C}'}</span>
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}
		</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			The <code class="text-surface-300">hecate-app-{pluginName}d</code> plugin daemon is not running.
			Start it to enable this plugin.
		</p>
		<div class="text-xs text-surface-500 bg-surface-800 border border-surface-600 rounded px-3 py-2 font-mono">
			~/.hecate/hecate-app-{pluginName}d/sockets/api.sock
		</div>
	</div>
{:else}
	<div bind:this={container} class="h-full overflow-auto p-4"></div>
{/if}
