<script lang="ts">
	import { goto } from '$app/navigation';
	import { activeAppId } from '$lib/stores/sidebar.js';
	import { showPluginUpdateModal } from '$lib/stores/pluginUpdater.js';
	import type { StudioCard } from '$lib/studios';

	let {
		card,
		online,
		version = null,
		updateVersion = null
	}: {
		card: StudioCard;
		online: boolean;
		version?: string | null;
		updateVersion?: string | null;
	} = $props();

	function navigate() {
		activeAppId.set(card.id);
		goto(card.path);
	}
</script>

<button
	class="group relative flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
		bg-surface-800/80 border border-surface-600/50
		hover:border-accent-500/30 hover:bg-surface-700/80
		transition-all duration-200"
	onclick={navigate}
>
	<span
		class="text-2xl transition-transform duration-200 group-hover:scale-110
			group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"
	>
		{card.icon}
	</span>

	<span
		class="text-sm font-medium text-surface-100 group-hover:text-accent-400 transition-colors text-center"
	>
		{card.name}
	</span>

	<div class="flex items-center gap-1.5 flex-wrap justify-center">
		<span class="text-[8px] {online ? 'text-health-ok' : 'text-surface-500'}">{'\u25CF'}</span>

		{#if version}
			<span class="text-[10px] text-surface-400 bg-surface-700 px-1.5 py-0.5 rounded">
				v{version}
			</span>
		{/if}

		{#if updateVersion}
			<!-- svelte-ignore node_invalid_placement_ssr -->
			<span
				role="button"
				tabindex="0"
				class="text-[10px] font-semibold bg-hecate-600 hover:bg-hecate-500 text-white px-1.5 py-0.5 rounded cursor-pointer"
				onclick={(e) => {
					e.stopPropagation();
					showPluginUpdateModal.set(card.id);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation();
						showPluginUpdateModal.set(card.id);
					}
				}}
			>
				{'\u2191'} v{updateVersion}
			</span>
		{/if}
	</div>

	<span class="text-[10px] text-surface-400 text-center leading-relaxed line-clamp-2">
		{card.description}
	</span>
</button>
