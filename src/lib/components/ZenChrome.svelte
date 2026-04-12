<script lang="ts">
	import { page } from '$app/state';
	import { vimMode } from '$lib/stores/vim';
	import { pluginTabs } from '$lib/plugins-registry';
	import { get } from 'svelte/store';
	import { isTauri } from '$lib/tauri';

	let showWindowControls = $state(false);

	if (typeof window !== 'undefined') {
		showWindowControls = isTauri();
	}

	async function minimize() {
		if (!isTauri()) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		await getCurrentWindow().minimize();
	}

	async function close() {
		if (!isTauri()) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		await getCurrentWindow().close();
	}

	let currentPath = $derived(page.url?.pathname ?? '/');
	let currentTab = $derived.by(() => {
		const tabs = get(pluginTabs);
		const idx = tabs.findIndex((t) =>
			t.path === '/' ? currentPath === '/' : currentPath.startsWith(t.path)
		);
		return { idx: idx + 1, total: tabs.length, tab: tabs[idx] };
	});

	let modeLabel = $derived.by(() => {
		switch ($vimMode) {
			case 'normal': return 'NORMAL';
			case 'insert': return 'INSERT';
			case 'visual': return 'VISUAL';
		}
	});

	let modeColor = $derived.by(() => {
		switch ($vimMode) {
			case 'normal': return 'bg-macula-500 text-surface-900';
			case 'insert': return 'bg-success-500 text-surface-900';
			case 'visual': return 'bg-accent-500 text-surface-900';
		}
	});
</script>

<!-- Vim-style status line for zen mode — pinned to bottom. -->
<div class="flex items-center h-6 shrink-0 bg-surface-800 border-t border-surface-700 text-sm font-mono select-none">
	<span class="px-2 h-full flex items-center font-bold {modeColor}">
		{modeLabel}
	</span>

	<span class="px-2 text-surface-300">
		{currentTab.tab?.name ?? currentPath}
	</span>

	<div class="flex-1"></div>

	<span class="px-2 text-surface-500">
		{currentTab.idx}/{currentTab.total}
	</span>

	<span class="px-2 text-surface-500">
		<span class="text-macula-400">:</span>cmd
		<span class="mx-1 text-surface-700">·</span>
		<span class="text-macula-400">1-9</span> tab
		<span class="mx-1 text-surface-700">·</span>
		<span class="text-macula-400">^⇧Z</span> exit
	</span>

	{#if showWindowControls}
		<button
			onclick={minimize}
			class="w-6 h-full text-surface-500 hover:text-surface-200 hover:bg-surface-700"
			aria-label="Minimize"
		>
			{'\u{2014}'}
		</button>
		<button
			onclick={close}
			class="w-6 h-full text-surface-500 hover:text-white hover:bg-danger-600"
			aria-label="Close"
		>
			{'\u{00D7}'}
		</button>
	{/if}
</div>
