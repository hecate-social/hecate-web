<script lang="ts">
	import { page } from '$app/state';
	import { plugins } from '$lib/stores/plugins';
	import { mount, unmount } from 'svelte';
	import { onDestroy } from 'svelte';

	const pluginName = $derived(page.params?.name ?? '');
	const plugin = $derived($plugins.get(pluginName));

	let container: HTMLElement | undefined = $state();
	let mounted: Record<string, any> | null = null;
	let mountedFor: string | null = null;

	$effect(() => {
		// Unmount previous if plugin changed
		if (mounted && mountedFor !== pluginName) {
			try {
				unmount(mounted);
			} catch {
				// Component already cleaned up
			}
			mounted = null;
			mountedFor = null;
		}

		// Mount new plugin component
		if (plugin?.component && container && !mounted) {
			mounted = mount(plugin.component, {
				target: container,
				props: { api: plugin.api }
			});
			mountedFor = pluginName;
		}
	});

	onDestroy(() => {
		if (mounted) {
			try {
				unmount(mounted);
			} catch {
				// Component already cleaned up by DOM removal
			}
			mounted = null;
			mountedFor = null;
		}
	});
</script>

{#if !plugin}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F50C}'}</span>
		<h2 class="text-lg font-bold text-surface-100">
			{pluginName.charAt(0).toUpperCase() + pluginName.slice(1)} Studio
		</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			The <code class="text-surface-300">hecate-{pluginName}d</code> plugin daemon is not running.
			Start it to enable this studio.
		</p>
		<div class="text-xs text-surface-500 bg-surface-800 border border-surface-600 rounded px-3 py-2 font-mono">
			~/.hecate/hecate-{pluginName}d/sockets/api.sock
		</div>
	</div>
{:else}
	<div bind:this={container} class="h-full overflow-auto"></div>
{/if}
