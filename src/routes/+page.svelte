<script lang="ts">
	import { health, connectionStatus, isStarting } from '$lib/stores/daemon.js';
	import { pluginCards, type PluginCardData } from '$lib/plugins-registry';
	import { plugins } from '$lib/stores/plugins.js';
	import { sidebarGroups, ungroupedApps } from '$lib/stores/sidebar.js';
	import { pluginUpdateVersion } from '$lib/stores/pluginUpdater.js';
	import AccordionGroup from '$lib/components/AccordionGroup.svelte';
	import PluginCard from '$lib/components/PluginCard.svelte';

	const DONATE_URL = 'https://buymeacoffee.com/rlefever';

	let ungroupedCollapsed = $state(false);

	let cardsMap = $derived(new Map($pluginCards.map((c) => [c.id, c])));

	let ungroupedCards = $derived(
		$ungroupedApps.map((tab) => cardFromId(tab.id))
	);

	let hasContent = $derived(
		$sidebarGroups.some((g) => g.appIds.length > 0) || ungroupedCards.length > 0
	);

	function cardFromId(id: string): PluginCardData {
		return (
			cardsMap.get(id) ?? {
				id,
				name: id.charAt(0).toUpperCase() + id.slice(1),
				icon: '\uD83D\uDD0C',
				path: `/plugin/${id}`,
				description: 'Plugin not currently available',
				ready: false,
				isPlugin: true
			}
		);
	}
</script>

<!-- Ambient glow background -->
<div
	class="absolute inset-0 pointer-events-none"
	style="background: radial-gradient(ellipse at center top, rgba(139, 71, 255, 0.08) 0%, rgba(245, 158, 11, 0.04) 30%, rgba(15, 15, 20, 1) 70%);"
></div>

<div class="relative flex flex-col items-center h-full overflow-y-auto py-6 px-6 gap-6">
	<!-- Brand -->
	<div class="flex flex-col items-center gap-2">
		<h1
			class="text-3xl font-bold tracking-wide"
			style="background: linear-gradient(135deg, #fbbf24, #f59e0b, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
		>
			Hecate
		</h1>

		<p class="text-surface-300 text-sm text-center max-w-md">
			Your node, your models, your data.
		</p>
	</div>

	<!-- Status ribbon -->
	<div
		class="flex items-center gap-3 px-4 py-2 rounded-full bg-surface-800/60 border border-surface-600/50 text-xs"
	>
		{#if $connectionStatus === 'connected'}
			<span class="text-health-ok">{'\u{25CF}'}</span>
			<span class="text-surface-200">Connected</span>
			{#if $health}
				<span class="text-surface-500">|</span>
				<span class="text-surface-300">v{$health.version}</span>
			{/if}
		{:else if $isStarting}
			<span class="text-health-warn animate-pulse">{'\u{25CF}'}</span>
			<span class="text-surface-300">Daemon starting...</span>
		{:else if $connectionStatus === 'connecting'}
			<span class="text-health-loading animate-pulse">{'\u{25CF}'}</span>
			<span class="text-surface-300">Connecting to daemon...</span>
		{:else}
			<span class="text-health-err">{'\u{25CF}'}</span>
			<span class="text-surface-400">Daemon not available</span>
		{/if}
	</div>

	<!-- Plugin cards (grouped accordion) -->
	{#if hasContent}
		<div class="flex flex-col gap-2 max-w-3xl w-full">
			{#each $sidebarGroups as group (group.id)}
				{@const cards = group.appIds.map((id) => cardFromId(id))}
				{#if cards.length > 0}
					<AccordionGroup {group}>
						<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
							{#each cards as card (card.id)}
								<PluginCard
									{card}
									online={!card.isPlugin || $plugins.has(card.id)}
									version={$plugins.get(card.id)?.manifest.version ?? null}
									updateVersion={card.isPlugin ? $pluginUpdateVersion(card.id) : null}
								/>
							{/each}
						</div>
					</AccordionGroup>
				{/if}
			{/each}

			{#if ungroupedCards.length > 0}
				<AccordionGroup
					group={{
						id: '__ungrouped__',
						name: 'Ungrouped',
						icon: '\uD83D\uDCCB',
						collapsed: ungroupedCollapsed,
						appIds: ungroupedCards.map((c) => c.id)
					}}
					ontoggle={() => (ungroupedCollapsed = !ungroupedCollapsed)}
				>
					<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
						{#each ungroupedCards as card (card.id)}
							<PluginCard
								{card}
								online={!card.isPlugin || $plugins.has(card.id)}
								version={$plugins.get(card.id)?.manifest.version ?? null}
								updateVersion={card.isPlugin ? $pluginUpdateVersion(card.id) : null}
							/>
						{/each}
					</div>
				</AccordionGroup>
			{/if}
		</div>
	{:else if $connectionStatus === 'connected'}
		<div class="flex flex-col items-center gap-3 text-center max-w-md">
			<span class="text-4xl">{'\u{2699}'}</span>
			<p class="text-sm text-surface-400">
				Use the sidebar to navigate to Settings, LLM, or the Appstore.
			</p>
		</div>
	{/if}

	<!-- Donate -->
	<a
		href={DONATE_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="flex items-center gap-2 px-4 py-2 rounded-full
			text-xs text-surface-400 hover:text-accent-400
			bg-surface-800/40 border border-surface-700/50 hover:border-accent-500/30
			transition-all duration-200"
	>
		<span>{'\u{2615}'}</span>
		<span>Buy me a coffee</span>
	</a>

	<!-- Footer tagline -->
	<p class="text-[10px] text-surface-500 text-center pb-4">
		Open source. Self-hosted. Yours.
	</p>
</div>
