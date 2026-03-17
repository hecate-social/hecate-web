<script lang="ts">
	import type { CheckStatus } from '$lib/stores/startup';
	import { checks, startupDone, elapsedMs } from '$lib/stores/startup';
	import { fade } from 'svelte/transition';

	let visible = $derived(!$startupDone);
	let elapsed = $derived(($elapsedMs / 1000).toFixed(1));
	let doneCount = $derived($checks.filter(c => c.status === 'done').length);

	function icon(status: CheckStatus): string {
		switch (status) {
			case 'done':    return '\u{2713}';
			case 'active':  return '\u{25CF}';
			case 'failed':  return '\u{2717}';
			default:        return '\u{25CB}';
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
			case 'done':    return 'text-surface-300';
			case 'active':  return 'text-surface-100';
			case 'failed':  return 'text-red-400';
			default:        return 'text-surface-600';
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
			<div class="flex flex-col gap-2.5 min-w-[260px]">
				{#each $checks as check (check.id)}
					<div class="flex items-start gap-3">
						<span class={`text-sm w-4 text-center mt-0.5 ${iconColor(check.status)}`}>
							{icon(check.status)}
						</span>
						<div class="flex flex-col gap-0.5">
							<span class={`text-xs font-medium ${labelColor(check.status)}`}>
								{check.label}
							</span>
							{#if check.detail && (check.status === 'active' || check.status === 'done')}
								<span class="text-[10px] leading-tight {check.status === 'active' ? 'text-amber-400/70' : 'text-surface-500'}">
									{check.detail.split('\n')[0]}
								</span>
								{#if check.detail.includes('\n')}
									<span class="text-[9px] leading-tight text-surface-600 font-mono">
										{check.detail.split('\n')[1]}
									</span>
								{/if}
							{/if}
							{#if check.status === 'failed' && check.detail}
								<span class="text-[10px] text-red-400/70">{check.detail}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Progress bar -->
			<div class="w-56 h-0.5 bg-surface-800 rounded-full overflow-hidden">
				<div
					class="h-full bg-gradient-to-r from-amber-500 to-purple-500 rounded-full transition-all duration-300"
					style="width: {(doneCount / $checks.length) * 100}%"
				></div>
			</div>

			<!-- Elapsed time -->
			<span class="text-[10px] text-surface-600">{elapsed}s</span>
		</div>
	</div>
{/if}
