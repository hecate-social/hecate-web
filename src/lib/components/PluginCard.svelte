<script lang="ts">
	import { goto } from '$app/navigation';
	import { activeAppId } from '$lib/stores/sidebar.js';
	import { showPluginUpdateModal } from '$lib/stores/pluginUpdater.js';
	import { post } from '$lib/api';
	import type { PluginCardData } from '$lib/plugins-registry';

	let {
		card,
		online,
		version = null,
		updateVersion = null,
		pluginId = null,
		actions = []
	}: {
		card: PluginCardData;
		online: boolean;
		version?: string | null;
		updateVersion?: string | null;
		pluginId?: string | null;
		actions?: string[];
	} = $props();

	let isCore = $derived(!card.isPlugin);
	let canStart = $derived(actions.includes('start'));

	function navigate() {
		activeAppId.set(card.id);
		// Auto-start non-running plugins when clicking the card
		if (card.isPlugin && canStart && pluginId) {
			post('/api/plugins/start', { plugin_id: pluginId }).catch(() => {});
		}
		goto(card.path);
	}
</script>

<button
	class="group relative flex flex-col items-center gap-3 p-4 rounded-xl cursor-pointer
		border transition-all duration-200
		{online || isCore
			? 'bg-surface-800/80 border-surface-600/50 hover:border-accent-500/30 hover:bg-surface-700/80'
			: 'bg-surface-900/60 border-surface-700/30 hover:border-surface-500/40 hover:bg-surface-800/60'}"
	onclick={navigate}
>
	<!-- Icon -->
	<div class="relative">
		<span
			class="text-3xl transition-transform duration-200 group-hover:scale-110
				{online || isCore
					? 'group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]'
					: 'opacity-60'}"
		>
			{card.icon}
		</span>
		<!-- Status dot overlay -->
		{#if card.isPlugin}
			<span
				class="absolute -bottom-0.5 -right-1 w-2.5 h-2.5 rounded-full border-2 border-surface-800
					{online ? 'bg-health-ok' : 'bg-surface-600'}"
			></span>
		{/if}
	</div>

	<!-- Name -->
	<span
		class="text-base font-medium transition-colors text-center leading-tight
			{online || isCore
				? 'text-surface-100 group-hover:text-accent-400'
				: 'text-surface-300 group-hover:text-surface-100'}"
	>
		{card.name}
	</span>

	<!-- Version + update badges -->
	{#if version || updateVersion}
		<div class="flex items-center gap-1.5 flex-wrap justify-center">
			{#if version}
				<span class="text-xs text-surface-500 bg-surface-700/80 px-1.5 py-0.5 rounded">
					v{version}
				</span>
			{/if}

			{#if updateVersion}
				<!-- svelte-ignore node_invalid_placement_ssr -->
				<span
					role="button"
					tabindex="0"
					class="text-xs font-semibold bg-macula-600 hover:bg-macula-500 text-white px-1.5 py-0.5 rounded cursor-pointer"
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
	{/if}

	<!-- Description -->
	<span class="text-xs text-surface-500 text-center leading-relaxed line-clamp-2">
		{card.description}
	</span>
</button>
