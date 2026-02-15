<script lang="ts">
	import NodeInspector from '$lib/components/node/NodeInspector.svelte';
	import { randomClip } from '$lib/artwork.js';
	import HeroClip from '$lib/components/HeroClip.svelte';

	const clip = randomClip();

	interface NodeApp {
		id: string;
		name: string;
		icon: string;
		description: string;
		active: boolean;
	}

	const apps: NodeApp[] = [
		{ id: 'inspector', name: 'Node Inspector', icon: '\u{1F50D}', description: 'Dashboard, identity, health, providers', active: true },
		{ id: 'mesh', name: 'Mesh View', icon: '\u{1F578}\u{FE0F}', description: 'Mesh topology and connections', active: false },
		{ id: 'marketplace', name: 'Marketplace', icon: '\u{1F3EA}', description: 'Apps and extensions', active: false }
	];

	let activeApp: string | null = $state(null);
</script>

{#if activeApp === 'inspector'}
	<NodeInspector onBack={() => activeApp = null} />
{:else}
	<!-- App Explorer -->
	<div class="flex flex-col items-center h-full overflow-y-auto py-8 px-6 gap-6">
		<HeroClip media={{ type: 'video', ...clip }} />

		<div class="flex flex-col items-center gap-2">
			<h2
				class="text-xl font-bold tracking-wide"
				style="background: linear-gradient(135deg, #fbbf24, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
			>
				Node Studio
			</h2>
			<p class="text-surface-400 text-xs text-center">
				Monitor and manage your Hecate node
			</p>
		</div>

		<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl w-full">
			{#each apps as app}
				{#if app.active}
					<button
						onclick={() => activeApp = app.id}
						class="group relative flex flex-col items-center gap-2.5 p-5 rounded-xl
							bg-surface-800/80 border border-surface-600/50
							hover:border-accent-500/30 hover:bg-surface-700/80
							transition-all duration-200 cursor-pointer"
					>
						<span
							class="text-2xl transition-transform duration-200 group-hover:scale-110
								group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"
						>
							{app.icon}
						</span>
						<span class="text-sm font-medium text-surface-100 group-hover:text-accent-400 transition-colors">
							{app.name}
						</span>
						<span class="text-[10px] text-surface-400 text-center leading-relaxed">
							{app.description}
						</span>
					</button>
				{:else}
					<div
						class="flex flex-col items-center gap-2.5 p-5 rounded-xl
							bg-surface-800/80 border border-surface-600/50 opacity-60"
					>
						<span class="text-2xl">{app.icon}</span>
						<span class="text-sm font-medium text-surface-100">{app.name}</span>
						<span class="text-[10px] text-surface-400 text-center leading-relaxed">
							{app.description}
						</span>
						<span class="text-[9px] text-surface-500 uppercase tracking-wider">Coming Soon</span>
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}
