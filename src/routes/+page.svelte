<script lang="ts">
	import { health, connectionStatus } from '$lib/stores/daemon.js';
	import { models } from '$lib/stores/llm.js';
	import { identity } from '$lib/stores/node.js';

	const DONATE_URL = 'https://buymeacoffee.com/rlefever';
	const ARTWORK_KEY = 'hecate-hero-index';

	interface HeroMedia {
		src: string;
		type: 'video' | 'image';
		caption: string;
	}

	const heroMedia: HeroMedia[] = [
		{ src: '/artwork/holds-up-key.mp4', type: 'video', caption: 'She who holds the key' },
		{ src: '/artwork/knowing-goddess.jpg', type: 'image', caption: 'The knowing goddess' },
		{ src: '/artwork/aura-turns-head.mp4', type: 'video', caption: 'Guardian of the crossroads' },
		{ src: '/artwork/silhouette-keybearer.jpg', type: 'image', caption: 'The keybearer' },
		{ src: '/artwork/portal.mp4', type: 'video', caption: 'Through the portal' },
		{ src: '/artwork/threshold-guardian.jpg', type: 'image', caption: 'Threshold guardian' },
		{ src: '/artwork/mysterious-snakes.mp4', type: 'video', caption: 'Ancient mysteries' },
		{ src: '/artwork/guardian-hounds-serpent.mp4', type: 'video', caption: 'Guardians at the gate' },
		{ src: '/artwork/close-up.mp4', type: 'video', caption: 'Eyes of amber' },
		{ src: '/artwork/realm-yield-to-key.mp4', type: 'video', caption: 'The realm shall yield' },
		{ src: '/artwork/sensual.mp4', type: 'video', caption: 'Power and grace' },
		{ src: '/artwork/key-hounds.mp4', type: 'video', caption: 'Key and hounds' },
		{ src: '/artwork/snakes.mp4', type: 'video', caption: 'Serpent wisdom' },
		{ src: '/artwork/silent-mysterious.mp4', type: 'video', caption: 'Silent watcher' },
		{ src: '/artwork/sexy.mp4', type: 'video', caption: 'The goddess awakens' },
		{ src: '/artwork/guardians-rise.mp4', type: 'video', caption: 'Guardians rise' },
	];

	// Cycle sequentially through artwork on each page visit
	let idx = 0;
	if (typeof localStorage !== 'undefined') {
		idx = parseInt(localStorage.getItem(ARTWORK_KEY) || '0') % heroMedia.length;
		localStorage.setItem(ARTWORK_KEY, String((idx + 1) % heroMedia.length));
	}
	const hero = heroMedia[idx];

	let heroLoaded = $state(false);

	// Fallback: force visible after 800ms in case load events don't fire
	if (typeof setTimeout !== 'undefined') {
		setTimeout(() => { heroLoaded = true; }, 800);
	}

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
			description: 'Dashboard, identity, health, models, providers',
			ready: true
		},
		{
			id: 'devops',
			name: 'DevOps Studio',
			icon: '\u{1F527}',
			path: '/devops',
			description: 'Ventures, divisions, deployments',
			ready: false
		},
		{
			id: 'social',
			name: 'Social Studio',
			icon: '\u{1F4AC}',
			path: '/social',
			description: 'Chat rooms, community',
			ready: false
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
	<!-- Hero artwork -->
	<div class="relative w-64 h-64 rounded-2xl overflow-hidden shrink-0
		ring-1 ring-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.15)]">

		<!-- Placeholder: always visible behind media -->
		<div class="absolute inset-0 bg-gradient-to-br from-surface-800 via-surface-900 to-black
			flex items-center justify-center">
			<img src="/logo.svg" alt="" class="w-20 h-10 opacity-20" />
		</div>

		<!-- Media: fades in on load -->
		{#if hero.type === 'video'}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				src={hero.src}
				autoplay
				loop
				muted
				playsinline
				class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700
					{heroLoaded ? 'opacity-100' : 'opacity-0'}"
				onloadeddata={() => heroLoaded = true}
				oncanplay={() => heroLoaded = true}
				onplaying={() => heroLoaded = true}
			></video>
		{:else}
			<img
				src={hero.src}
				alt={hero.caption}
				class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700
					{heroLoaded ? 'opacity-100' : 'opacity-0'}"
				onload={() => heroLoaded = true}
			/>
		{/if}

		<!-- Bottom gradient overlay for caption -->
		<div class="absolute inset-x-0 bottom-0 h-16
			bg-gradient-to-t from-black/70 to-transparent
			flex items-end justify-center pb-2">
			<span class="text-[10px] text-amber-200/70 italic tracking-wide">{hero.caption}</span>
		</div>

		<!-- Subtle inner border glow -->
		<div class="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5 pointer-events-none"></div>
	</div>

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
				<span class="text-amber-400">{$models.length} model{$models.length !== 1 ? 's' : ''}</span>
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
					hover:border-amber-500/30 hover:bg-surface-700/80
					transition-all duration-200
					{card.ready ? '' : 'opacity-60'}"
			>
				<span
					class="text-2xl transition-transform duration-200 group-hover:scale-110
						{card.ready ? 'group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]' : ''}"
				>
					{card.icon}
				</span>
				<span class="text-sm font-medium text-surface-100 group-hover:text-amber-200 transition-colors">
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
			text-xs text-surface-400 hover:text-amber-300
			bg-surface-800/40 border border-surface-700/50 hover:border-amber-500/30
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
