<script lang="ts">
	import { isStarting, isUnavailable, showOverlay, health, unavailableSince } from '$lib/stores/daemon.js';
	import { fade } from 'svelte/transition';
	import { onDestroy } from 'svelte';

	const ESCALATION_MS = 15_000;
	const CYCLE_MS = 4_000;
	let waitingLong = $state(false);
	let tickTimer: ReturnType<typeof setInterval> | null = null;
	let cycleTimer: ReturnType<typeof setInterval> | null = null;

	// Hecate's mythological companions
	// Hecuba: Queen of Troy, transformed into a black dog
	// Galinthias: handmaid turned polecat, Hecate's sacred attendant
	// the Lampades: underworld torch-bearing nymphs, gift from Zeus
	// the Serpents: sacred animals often depicted with her triple form
	// her Hounds: dogs sacred to Hecate, announce her approach at crossroads
	const familiars = ['Hecuba', 'Galinthias', 'the Lampades', 'the Serpents', 'her Hounds'];
	let familiarIdx = $state(Math.floor(Math.random() * familiars.length));
	let familiar = $derived(familiars[familiarIdx]);

	function pickNext() {
		let next: number;
		do {
			next = Math.floor(Math.random() * familiars.length);
		} while (next === familiarIdx && familiars.length > 1);
		familiarIdx = next;
	}

	function startTicking() {
		stopTicking();
		waitingLong = false;
		pickNext();
		tickTimer = setInterval(() => {
			const since = $unavailableSince;
			waitingLong = since !== null && Date.now() - since >= ESCALATION_MS;
		}, 1000);
		cycleTimer = setInterval(pickNext, CYCLE_MS);
	}

	function stopTicking() {
		if (tickTimer) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
		if (cycleTimer) {
			clearInterval(cycleTimer);
			cycleTimer = null;
		}
	}

	$effect(() => {
		if ($showOverlay) {
			startTicking();
		} else {
			stopTicking();
			waitingLong = false;
		}
	});

	onDestroy(stopTicking);
</script>

{#if $showOverlay}
	<div
		class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-950/90 backdrop-blur-sm"
		transition:fade={{ duration: 300 }}
	>
		<!-- Ambient glow -->
		<div
			class="absolute inset-0 pointer-events-none"
			style="background: radial-gradient(ellipse at center, rgba(139, 71, 255, 0.12) 0%, rgba(245, 158, 11, 0.06) 30%, transparent 60%);"
		></div>

		<!-- Content -->
		<div class="relative flex flex-col items-center gap-6">
			<!-- Hecate artwork -->
			<div class="splash-portrait">
				<img
					src="/artwork/silhouette-keybearer.jpg"
					alt="Hecate, keeper of the key"
					class="w-56 h-56 object-cover rounded-full"
					style="mask-image: radial-gradient(circle, black 50%, transparent 80%); -webkit-mask-image: radial-gradient(circle, black 50%, transparent 80%);"
				/>
			</div>

			<!-- Brand -->
			<h1
				class="text-2xl font-bold tracking-widest -mt-2"
				style="background: linear-gradient(135deg, #fbbf24, #f59e0b, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
			>
				HECATE
			</h1>

			<!-- Status -->
			<div class="flex flex-col items-center gap-2">
				{#if $isUnavailable}
					<div class="flex items-center gap-2">
						<span class="text-health-err animate-pulse text-sm">{'\u{25CF}'}</span>
						<span class="text-surface-300 text-sm">Summoning {familiar}...</span>
					</div>
				{:else}
					<div class="flex items-center gap-2">
						<span class="text-health-warn animate-pulse text-sm">{'\u{25CF}'}</span>
						<span class="text-surface-300 text-sm">Daemon starting...</span>
					</div>
					{#if $health}
						<span class="text-surface-500 text-xs">
							uptime {$health.uptime_seconds}s
						</span>
					{/if}
				{/if}
			</div>

			<!-- Animated bar -->
			<div class="w-48 h-0.5 bg-surface-800 rounded-full overflow-hidden">
				<div class="h-full bg-gradient-to-r from-amber-500 via-purple-500 to-amber-500 animate-shimmer rounded-full"></div>
			</div>

			<p class="text-[10px] text-surface-600 mt-2 italic">
				{$isUnavailable ? 'She who holds the key, lights the way.' : 'Waiting for domain services...'}
			</p>

			<!-- Escalation hint after 15s -->
			{#if waitingLong && $isUnavailable}
				<p class="text-[11px] text-surface-400 mt-2" transition:fade={{ duration: 200 }}>
					Ensure the Hecate daemon container is running.
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	@keyframes shimmer {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(200%); }
	}
	.animate-shimmer {
		width: 40%;
		animation: shimmer 1.5s ease-in-out infinite;
	}
	@keyframes portrait-glow {
		0%, 100% { filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.3)); }
		50% { filter: drop-shadow(0 0 24px rgba(168, 117, 255, 0.4)); }
	}
	.splash-portrait {
		animation: portrait-glow 3s ease-in-out infinite;
	}
</style>
