<script lang="ts">
	import SnakeDuelView from '$lib/components/arcade/SnakeDuelView.svelte';

	interface ArcadeGame {
		id: string;
		name: string;
		icon: string;
		description: string;
		active: boolean;
	}

	const games: ArcadeGame[] = [
		{ id: 'snake-duel', name: 'Snake Duel', icon: '\u{1F40D}', description: '2 AI snakes battle in an arena', active: true },
		{ id: 'more', name: 'More Games', icon: '\u{1F3B2}', description: 'More games coming', active: false }
	];

	let activeApp: string | null = $state(null);
</script>

{#if activeApp === 'snake-duel'}
	<SnakeDuelView onBack={() => (activeApp = null)} />
{:else}
	<div class="flex flex-col items-center h-full overflow-y-auto py-8 px-6 gap-6">
		<div class="flex flex-col items-center gap-2">
			<h2
				class="text-xl font-bold tracking-wide"
				style="background: linear-gradient(135deg, #fbbf24, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
			>
				Arcade Studio
			</h2>
			<p class="text-surface-400 text-xs text-center">
				Games and entertainment on the mesh
			</p>
		</div>

		<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
			{#each games as game}
				{#if game.active}
					<button
						onclick={() => (activeApp = game.id)}
						class="flex flex-col items-center gap-2.5 p-5 rounded-xl cursor-pointer
							bg-surface-800/80 border border-surface-600/50
							hover:border-yellow-500/60 hover:shadow-[0_0_12px_rgba(251,191,36,0.15)]
							transition-all duration-200"
					>
						<span class="text-2xl">{game.icon}</span>
						<span class="text-sm font-medium text-surface-100">{game.name}</span>
						<span class="text-[10px] text-surface-400 text-center leading-relaxed">
							{game.description}
						</span>
						<span class="text-[9px] text-yellow-500 uppercase tracking-wider">Play</span>
					</button>
				{:else}
					<div
						class="flex flex-col items-center gap-2.5 p-5 rounded-xl
							bg-surface-800/80 border border-surface-600/50 opacity-60"
					>
						<span class="text-2xl">{game.icon}</span>
						<span class="text-sm font-medium text-surface-100">{game.name}</span>
						<span class="text-[10px] text-surface-400 text-center leading-relaxed">
							{game.description}
						</span>
						<span class="text-[9px] text-surface-500 uppercase tracking-wider">Coming Soon</span>
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}
