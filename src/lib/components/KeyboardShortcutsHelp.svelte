<script lang="ts">
	import { shortcuts, registerShortcut, pushOverlay, popOverlay } from '$lib/stores/keyboard';
	import { get } from 'svelte/store';
	import { onDestroy } from 'svelte';

	let open = $state(false);

	function show() {
		open = true;
		pushOverlay('keyboard-help', hide);
	}

	function hide() {
		open = false;
		popOverlay('keyboard-help');
	}

	function toggle() {
		if (open) hide();
		else show();
	}

	function formatKey(s: { key: string; modifiers: string[] }): string {
		const parts = s.modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
		const keyLabel = s.key === ' ' ? 'Space' : s.key.length === 1 ? s.key.toUpperCase() : s.key;
		parts.push(keyLabel);
		return parts.join(' + ');
	}

	let grouped = $derived.by(() => {
		const all = get(shortcuts);
		const map = new Map<string, typeof all>();
		for (const s of all) {
			const list = map.get(s.category) ?? [];
			list.push(s);
			map.set(s.category, list);
		}
		return map;
	});

	const unregister = registerShortcut({
		key: '?',
		modifiers: [],
		label: 'Keyboard Shortcuts',
		category: 'General',
		handler: toggle,
	});

	onDestroy(unregister);
</script>

{#if open}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 bg-black/40 z-60"
		onclick={hide}
		aria-label="Close shortcuts help"
	></button>

	<!-- Panel -->
	<div
		class="fixed top-[15%] left-1/2 -translate-x-1/2 z-60
			w-[520px] max-w-[90vw] bg-surface-800 border border-surface-600
			rounded-xl shadow-2xl overflow-hidden"
	>
		<div class="flex items-center justify-between px-5 py-3 border-b border-surface-700">
			<h2 class="text-base font-semibold text-surface-100">Keyboard Shortcuts</h2>
			<button
				onclick={hide}
				class="text-surface-500 hover:text-surface-300 transition-colors cursor-pointer"
				aria-label="Close"
			>
				<svg class="size-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="max-h-[400px] overflow-y-auto p-5 space-y-5">
			{#each [...grouped] as [category, items]}
				<div>
					<h3 class="text-xs uppercase tracking-wider text-surface-500 mb-2">{category}</h3>
					<div class="space-y-1.5">
						{#each items as item}
							<div class="flex items-center justify-between">
								<span class="text-sm text-surface-300">{item.label}</span>
								<kbd class="text-xs font-mono text-surface-400 bg-surface-700 border border-surface-600 px-2 py-0.5 rounded">
									{formatKey(item)}
								</kbd>
							</div>
						{/each}
					</div>
				</div>
			{/each}

			{#if grouped.size === 0}
				<div class="text-center text-sm text-surface-500 py-4">No shortcuts registered</div>
			{/if}
		</div>
	</div>
{/if}
