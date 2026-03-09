<script lang="ts">
	import { fly } from 'svelte/transition';
	import { activities, activityCount, clearActivity, type ActivityLevel } from '$lib/stores/activity';

	let open = $state(false);

	const levelColors: Record<ActivityLevel, string> = {
		info: 'text-blue-400',
		success: 'text-emerald-400',
		warning: 'text-amber-400',
		error: 'text-red-400'
	};

	const levelDots: Record<ActivityLevel, string> = {
		info: 'bg-blue-400',
		success: 'bg-emerald-400',
		warning: 'bg-amber-400',
		error: 'bg-red-400'
	};

	function formatTime(ts: number): string {
		const d = new Date(ts);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

<div class="relative">
	<button
		onclick={() => open = !open}
		class="flex items-center gap-1 text-surface-400 hover:text-surface-200 transition-colors cursor-pointer"
		aria-label="Toggle activity feed"
	>
		<svg class="size-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
		</svg>
		{#if $activityCount > 0}
			<span class="text-[10px]">{$activityCount}</span>
		{/if}
	</button>

	{#if open}
		<div
			class="absolute bottom-7 right-0 w-80 max-h-64 bg-surface-800 border border-surface-600 rounded-lg shadow-xl overflow-hidden z-50"
			transition:fly={{ y: 10, duration: 150 }}
		>
			<div class="flex items-center justify-between px-3 py-1.5 border-b border-surface-600">
				<span class="text-[11px] font-medium text-surface-300">Activity</span>
				{#if $activityCount > 0}
					<button
						onclick={clearActivity}
						class="text-[10px] text-surface-500 hover:text-surface-300 cursor-pointer"
					>Clear</button>
				{/if}
			</div>

			<div class="overflow-y-auto max-h-52">
				{#if $activities.length === 0}
					<div class="px-3 py-4 text-center text-[11px] text-surface-500">
						No activity yet
					</div>
				{:else}
					{#each $activities as entry (entry.id)}
						<div class="flex items-start gap-2 px-3 py-1.5 hover:bg-surface-700/50 border-b border-surface-700/30 last:border-0">
							<span class="size-1.5 rounded-full mt-1.5 shrink-0 {levelDots[entry.level]}"></span>
							<div class="flex-1 min-w-0">
								<p class="text-[11px] text-surface-200 leading-snug truncate">{entry.message}</p>
								<p class="text-[10px] text-surface-500">{formatTime(entry.timestamp)}</p>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
