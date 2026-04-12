<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pluginTabs } from '$lib/plugins-registry';
	import { pushOverlay, popOverlay, registerShortcut } from '$lib/stores/keyboard';
	import { get } from 'svelte/store';
	import { onDestroy } from 'svelte';

	let open = $state(false);
	let selectedIndex = $state(0);
	let tabs = $state(get(pluginTabs));

	function currentTabIndex(): number {
		const currentPath = page.url?.pathname ?? '/';
		const idx = tabs.findIndex((t) =>
			t.path === '/' ? currentPath === '/' : currentPath.startsWith(t.path)
		);
		return idx >= 0 ? idx : 0;
	}

	function show() {
		tabs = get(pluginTabs);
		selectedIndex = currentTabIndex();
		// Pre-advance to next
		selectedIndex = (selectedIndex + 1) % tabs.length;
		open = true;
		pushOverlay('plugin-switcher', cancel);
	}

	function cycle() {
		if (!open) {
			show();
			return;
		}
		selectedIndex = (selectedIndex + 1) % tabs.length;
	}

	function confirm() {
		if (!open) return;
		const tab = tabs[selectedIndex];
		hide();
		if (tab) goto(tab.path);
	}

	function cancel() {
		open = false;
		popOverlay('plugin-switcher');
	}

	function hide() {
		open = false;
		popOverlay('plugin-switcher');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % tabs.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + tabs.length) % tabs.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			confirm();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}

	function handleKeyup(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Control') {
			confirm();
		}
	}

	const unregister = registerShortcut({
		key: 'p',
		modifiers: ['ctrl'],
		label: 'Quick Switch',
		category: 'Navigation',
		handler: cycle,
	});

	onDestroy(unregister);
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

{#if open}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 bg-black/40 z-60"
		onclick={cancel}
		aria-label="Close plugin switcher"
	></button>

	<!-- Panel -->
	<div
		class="fixed top-[25%] left-1/2 -translate-x-1/2 z-60
			w-[320px] max-w-[90vw] bg-surface-800 border border-surface-600
			rounded-xl shadow-2xl overflow-hidden"
	>
		<div class="px-4 py-2.5 border-b border-surface-700">
			<div class="text-sm text-surface-400">Quick Switch</div>
		</div>

		<div class="max-h-[360px] overflow-y-auto py-1">
			{#each tabs as tab, i (tab.id)}
				{@const isCurrent = i === currentTabIndex()}
				<button
					class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer
						{i === selectedIndex
							? 'bg-macula-500/15 border-l-2 border-macula-500 text-surface-50'
							: 'border-l-2 border-transparent text-surface-300 hover:bg-surface-700/50'}"
					onclick={() => { selectedIndex = i; confirm(); }}
					onmouseenter={() => (selectedIndex = i)}
				>
					<span class="text-base shrink-0">{tab.icon}</span>
					<span class="text-sm flex-1 truncate">{tab.name}</span>
					{#if isCurrent}
						<span class="text-[9px] text-surface-500">current</span>
					{/if}
				</button>
			{/each}
		</div>

		<div class="px-4 py-2 border-t border-surface-700 flex gap-3 text-[9px] text-surface-500">
			<span><kbd class="font-mono bg-surface-700 px-1 rounded">Ctrl+P</kbd> cycle</span>
			<span><kbd class="font-mono bg-surface-700 px-1 rounded">&uarr;&darr;</kbd> move</span>
			<span><kbd class="font-mono bg-surface-700 px-1 rounded">Enter</kbd> go</span>
		</div>
	</div>
{/if}
