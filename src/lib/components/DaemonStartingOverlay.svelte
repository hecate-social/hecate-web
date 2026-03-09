<script lang="ts">
	import type { CheckStatus } from '$lib/stores/startup';
	import { checks, startupDone } from '$lib/stores/startup';
	import { fade } from 'svelte/transition';

	let visible = $derived(!$startupDone);

	function icon(status: CheckStatus): string {
		switch (status) {
			case 'done':    return '\u{2713}';  // checkmark
			case 'active':  return '\u{25CF}';  // filled circle
			case 'failed':  return '\u{2717}';  // cross
			default:        return '\u{25CB}';  // empty circle
		}
	}

	function iconColor(status: CheckStatus): string {
		switch (status) {
			case 'done':    return 'text-emerald-400';
			case 'active':  return 'text-amber-400 animate-pulse';
			case 'failed':  return 'text-red-400';
			default:        return 'text-surface-600';
		}
	}

	function labelColor(status: CheckStatus): string {
		switch (status) {
			case 'done':    return 'text-surface-200';
			case 'active':  return 'text-surface-200';
			case 'failed':  return 'text-red-400';
			default:        return 'text-surface-500';
		}
	}
</script>

{#if visible}
	<div
		class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface-950/95 backdrop-blur-sm"
		transition:fade={{ duration: 300 }}
	>
		<!-- Ambient glow -->
		<div
			class="absolute inset-0 pointer-events-none"
			style="background: radial-gradient(ellipse at center, rgba(139, 71, 255, 0.08) 0%, rgba(245, 158, 11, 0.04) 30%, transparent 60%);"
		></div>

		<div class="relative flex flex-col items-center gap-8">
			<!-- Brand -->
			<h1
				class="text-3xl font-bold tracking-widest"
				style="background: linear-gradient(135deg, #fbbf24, #f59e0b, #a875ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
			>
				HECATE
			</h1>

			<!-- Checklist -->
			<div class="flex flex-col gap-3 min-w-[220px]">
				{#each $checks as check (check.id)}
					<div class="flex items-center gap-3">
						<span class={`text-sm w-4 text-center ${iconColor(check.status)}`}>
							{icon(check.status)}
						</span>
						<div class="flex flex-col">
							<span class={`text-xs font-medium ${labelColor(check.status)}`}>
								{check.label}
							</span>
							{#if check.detail && check.status === 'active'}
								<span class="text-[10px] text-surface-500">{check.detail}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Progress bar -->
			<div class="w-48 h-0.5 bg-surface-800 rounded-full overflow-hidden">
				<div
					class="h-full bg-gradient-to-r from-amber-500 to-purple-500 rounded-full transition-all duration-500"
					style="width: {($checks.filter(c => c.status === 'done').length / $checks.length) * 100}%"
				></div>
			</div>
		</div>
	</div>
{/if}
