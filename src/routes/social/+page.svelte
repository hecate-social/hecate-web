<script lang="ts">
	import IrcView from '$lib/components/social/IrcView.svelte';
	import { randomClip } from '$lib/artwork.js';
	import HeroClip from '$lib/components/HeroClip.svelte';

	const clip = randomClip();

	interface SocialApp {
		id: string;
		name: string;
		icon: string;
		description: string;
		active: boolean;
	}

	const apps: SocialApp[] = [
		{ id: 'irc', name: 'IRC', icon: '#', description: 'Chat channels over the mesh', active: true },
		{ id: 'forum', name: 'Forum', icon: '\u{1F4AC}', description: 'Threaded discussions', active: false },
		{ id: 'feed', name: 'Feed', icon: '\u{1F4E1}', description: 'Activity feed / timeline', active: false },
		{ id: 'news', name: 'News', icon: '\u{1F4F0}', description: 'News aggregator', active: false },
		{ id: 'conferencing', name: 'Conferencing', icon: '\u{1F4F9}', description: 'Voice / video calls', active: false }
	];

	let activeApp: string | null = $state(null);
</script>

{#if activeApp === 'irc'}
	<IrcView onBack={() => activeApp = null} />
{:else}
	<!-- App Explorer -->
	<div class="flex flex-col items-center h-full overflow-y-auto py-8 px-6 gap-6">
		<HeroClip media={{ type: 'video', ...clip }} />

		<div class="flex flex-col items-center gap-2">
			<h2
				class="text-xl font-bold tracking-wide"
				style="background: linear-gradient(135deg, #fbbf24, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
			>
				Social Studio
			</h2>
			<p class="text-surface-400 text-xs text-center">
				Connect, discuss, and share across the mesh
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
