<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts, dismissToast, type ToastType } from '$lib/stores/toasts';

	const borderColors: Record<ToastType, string> = {
		success: 'border-l-emerald-500',
		error: 'border-l-red-500',
		info: 'border-l-blue-400',
		warning: 'border-l-amber-500'
	};

	const icons: Record<ToastType, string> = {
		success: '\u2713',
		error: '\u2717',
		info: '\u2139',
		warning: '\u26A0'
	};

	const iconColors: Record<ToastType, string> = {
		success: 'text-emerald-400',
		error: 'text-red-400',
		info: 'text-blue-400',
		warning: 'text-amber-400'
	};
</script>

<div class="fixed bottom-8 right-4 z-50 flex flex-col gap-2 pointer-events-none">
	{#each $toasts as toast (toast.id)}
		<div
			class="pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded-md border-l-[3px] bg-surface-800 border border-surface-600 shadow-lg max-w-[340px] text-[12px] {borderColors[toast.type]}"
			transition:fly={{ x: 60, duration: 200 }}
			role="alert"
		>
			<span class="text-base leading-none mt-px {iconColors[toast.type]}">{icons[toast.type]}</span>
			<span class="text-surface-200 leading-snug flex-1">{toast.message}</span>
			{#if toast.dismissible}
				<button
					onclick={() => dismissToast(toast.id)}
					class="text-surface-500 hover:text-surface-300 text-sm leading-none mt-px shrink-0"
					aria-label="Dismiss"
				>&times;</button>
			{/if}
		</div>
	{/each}
</div>
