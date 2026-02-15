<script lang="ts">
	import type { HeroMedia } from '$lib/artwork.js';

	interface Props {
		media: HeroMedia;
		size?: string;
	}

	let { media, size = 'w-48 h-48' }: Props = $props();

	let loaded = $state(false);
	let videoEl: HTMLVideoElement | undefined = $state();

	if (typeof setTimeout !== 'undefined') {
		setTimeout(() => { loaded = true; }, 800);
	}

	$effect(() => {
		if (videoEl) {
			videoEl.play().catch(() => {});
		}
	});
</script>

<div class="relative {size} rounded-2xl overflow-hidden shrink-0
	ring-1 ring-accent-500/20 shadow-[0_0_40px_rgba(245,158,11,0.15)]">

	<!-- Placeholder behind media -->
	<div class="absolute inset-0 bg-gradient-to-br from-surface-800 via-surface-900 to-black
		flex items-center justify-center">
		<img src="/logo.svg" alt="" class="w-20 h-10 opacity-20" />
	</div>

	<!-- Media: fades in on load -->
	{#if media.type === 'video'}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoEl}
			src={media.src}
			autoplay
			loop
			muted
			playsinline
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700
				{loaded ? 'opacity-100' : 'opacity-0'}"
			onloadeddata={() => loaded = true}
			oncanplay={() => loaded = true}
			onplaying={() => loaded = true}
		></video>
	{:else}
		<img
			src={media.src}
			alt={media.caption}
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700
				{loaded ? 'opacity-100' : 'opacity-0'}"
			onload={() => loaded = true}
		/>
	{/if}

	<!-- Bottom gradient overlay for caption -->
	<div class="absolute inset-x-0 bottom-0 h-16
		bg-gradient-to-t from-black/70 to-transparent
		flex items-end justify-center pb-2">
		<span class="text-[10px] text-accent-400/70 italic tracking-wide">{media.caption}</span>
	</div>

	<!-- Subtle inner border glow -->
	<div class="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5 pointer-events-none"></div>
</div>
