<script lang="ts">
	import { health, connectionStatus } from '$lib/stores/daemon.js';
	import { models } from '$lib/stores/llm.js';
	import { identity } from '$lib/stores/node.js';
	const DONATE_URL = 'https://buymeacoffee.com/rlefever';

	interface StudioCard {
		id: string;
		name: string;
		icon: string;
		path: string;
		description: string;
		ready: boolean;
	}

	const studioCards: StudioCard[] = [
		{
			id: 'llm',
			name: 'LLM Studio',
			icon: '\u{1F916}',
			path: '/llm',
			description: 'Chat with AI models, streaming responses, provider management',
			ready: true
		},
		{
			id: 'node',
			name: 'Node Studio',
			icon: '\u{1F310}',
			path: '/node',
			description: 'Node inspector, mesh view, marketplace',
			ready: true
		},
		{
			id: 'social',
			name: 'Social Studio',
			icon: '\u{1F4AC}',
			path: '/social',
			description: 'IRC, forums, feeds, community',
			ready: true
		},
		{
			id: 'arcade',
			name: 'Arcade Studio',
			icon: '\u{1F3AE}',
			path: '/arcade',
			description: 'Games and entertainment',
			ready: false
		}
	];
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
			Guardian of the crossroads. Your daemon, your keys, your realm.
		</p>
	</div>

	<!-- Status ribbon -->
	<div
		class="flex items-center gap-3 px-4 py-2 rounded-full bg-surface-800/60 border border-surface-600/50 text-xs"
	>
		{#if $connectionStatus === 'connected'}
			<span class="text-health-ok">{'\u{25CF}'}</span>
			<span class="text-surface-200">
				{#if $identity?.identity?.display_name}
					{$identity.identity.display_name}
				{:else}
					Connected
				{/if}
			</span>
			{#if $health}
				<span class="text-surface-500">|</span>
				<span class="text-surface-300">v{$health.version}</span>
			{/if}
			{#if $models.length > 0}
				<span class="text-surface-500">|</span>
				<span class="text-accent-400">{$models.length} model{$models.length !== 1 ? 's' : ''}</span>
			{/if}
		{:else if $connectionStatus === 'connecting'}
			<span class="text-health-loading animate-pulse">{'\u{25CF}'}</span>
			<span class="text-surface-300">Connecting to daemon...</span>
		{:else}
			<span class="text-health-err">{'\u{25CF}'}</span>
			<span class="text-surface-400">Daemon not available</span>
		{/if}
	</div>

	<!-- Studio cards -->
	<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
		{#each studioCards as card}
			<a
				href={card.path}
				class="group relative flex flex-col items-center gap-2.5 p-5 rounded-xl
					bg-surface-800/80 border border-surface-600/50
					hover:border-accent-500/30 hover:bg-surface-700/80
					transition-all duration-200
					{card.ready ? '' : 'opacity-60'}"
			>
				<span
					class="text-2xl transition-transform duration-200 group-hover:scale-110
						{card.ready ? 'group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]' : ''}"
				>
					{card.icon}
				</span>
				<span class="text-sm font-medium text-surface-100 group-hover:text-accent-400 transition-colors">
					{card.name}
				</span>
				<span class="text-[10px] text-surface-400 text-center leading-relaxed">
					{card.description}
				</span>
				{#if !card.ready}
					<span class="text-[9px] text-surface-500 uppercase tracking-wider">Coming Soon</span>
				{/if}
			</a>
		{/each}
	</div>

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
		She who holds the key, lights the way.
	</p>
</div>
