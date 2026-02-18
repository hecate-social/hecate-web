<script lang="ts">
	import { plugins } from '$lib/stores/plugins';
	import { mount, unmount } from 'svelte';

	let container: HTMLElement | undefined = $state();
	let mounted: ReturnType<typeof mount> | null = $state(null);

	const plugin = $derived($plugins.get('trader'));

	$effect(() => {
		if (plugin?.component && container) {
			// Unmount previous if any
			if (mounted) {
				unmount(mounted);
				mounted = null;
			}
			mounted = mount(plugin.component, {
				target: container,
				props: { api: plugin.api }
			});
		}

		return () => {
			if (mounted) {
				unmount(mounted);
				mounted = null;
			}
		};
	});
</script>

{#if !plugin}
	<div class="flex flex-col items-center justify-center h-full gap-4">
		<span class="text-4xl">{'\u{1F4C8}'}</span>
		<h2 class="text-lg font-bold text-surface-100">Trader Studio</h2>
		<p class="text-sm text-surface-400 text-center max-w-md">
			The Trader plugin daemon is not running. Start <code class="text-surface-300">hecate-traderd</code> to enable this studio.
		</p>
		<div class="text-xs text-surface-500 bg-surface-800 border border-surface-600 rounded px-3 py-2 font-mono">
			~/.hecate/hecate-traderd/sockets/api.sock
		</div>
	</div>
{:else}
	<div bind:this={container} class="h-full"></div>
{/if}
