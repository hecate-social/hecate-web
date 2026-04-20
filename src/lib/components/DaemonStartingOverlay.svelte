<script lang="ts">
	import { viewstate } from '$lib/stores/daemon';
	import { startupDone, elapsedMs } from '$lib/stores/startup';
	import { variantClass, iconChar } from '$lib/viewstate';
	import { fade } from 'svelte/transition';

	let visible = $derived(!$startupDone);
	let elapsed = $derived(($elapsedMs / 1000).toFixed(1));

	let steps = $derived($viewstate.startup.steps);
	let doneCount = $derived(steps.filter(s => s.variant === 'ok').length);
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

			<!-- Checklist (pure render from daemon viewstate) -->
			<div class="flex flex-col gap-2.5 min-w-[260px]">
				{#each steps as step (step.id)}
					<div class="flex items-start gap-3">
						<span class={`text-base w-4 text-center mt-0.5 ${variantClass[step.variant]}`}>
							{iconChar[step.icon]}
						</span>
						<div class="flex flex-col gap-0.5">
							<span class={`text-sm font-medium ${step.variant === 'ok' ? 'text-surface-300' : step.variant === 'warn' ? 'text-surface-100' : step.variant === 'err' ? 'text-red-400' : 'text-surface-600'}`}>
								{step.label}
							</span>
							{#if step.detail}
								<span class="text-xs leading-tight {step.variant === 'warn' ? 'text-amber-400/70' : 'text-surface-500'}">
									{step.detail}
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Progress bar -->
			<div class="w-56 h-0.5 bg-surface-800 rounded-full overflow-hidden">
				<div
					class="h-full bg-gradient-to-r from-amber-500 to-purple-500 rounded-full transition-all duration-300"
					style="width: {(doneCount / steps.length) * 100}%"
				></div>
			</div>

			<!-- Elapsed time -->
			<span class="text-xs text-surface-600">{elapsed}s</span>
		</div>
	</div>
{/if}
