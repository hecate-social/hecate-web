<script lang="ts">
	import { goto } from '$app/navigation';
	import { pluginTabs } from '$lib/plugins-registry';
	import { toggleSidebar } from '$lib/stores/sidebar.js';
	import { pushOverlay, popOverlay, registerShortcut, shortcuts } from '$lib/stores/keyboard';
	import { get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';

	let open = $state(false);
	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();

	interface PaletteItem {
		id: string;
		label: string;
		category: string;
		icon: string;
		shortcut?: string;
		action: () => void;
	}

	const actions: PaletteItem[] = [
		{ id: 'action:toggle-sidebar', label: 'Toggle Sidebar', category: 'Actions', icon: '\u2630', shortcut: 'Ctrl+B', action: toggleSidebar },
	];

	let items = $derived.by(() => {
		const tabs = get(pluginTabs);
		const pageItems: PaletteItem[] = tabs.map((t) => ({
			id: `page:${t.id}`,
			label: t.name,
			category: t.isPlugin ? 'Plugins' : 'Pages',
			icon: t.icon,
			action: () => goto(t.path),
		}));

		// Add shortcut badges from registry
		const registered = get(shortcuts);
		const actionItems = actions.map((a) => ({ ...a }));
		for (const s of registered) {
			const modStr = s.modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join('+');
			const badge = modStr ? `${modStr}+${s.key.toUpperCase()}` : s.key;
			const existing = actionItems.find((ai) => ai.label === s.label);
			if (existing) existing.shortcut = badge;
		}

		const all = [...pageItems, ...actionItems];

		if (!query.trim()) return all;

		const q = query.toLowerCase();
		return all.filter((item) => item.label.toLowerCase().includes(q));
	});

	$effect(() => {
		// Reset selection when items change
		if (items) selectedIndex = 0;
	});

	function show() {
		open = true;
		query = '';
		selectedIndex = 0;
		pushOverlay('command-palette', hide);
		requestAnimationFrame(() => inputEl?.focus());
	}

	function hide() {
		open = false;
		popOverlay('command-palette');
	}

	function execute(item: PaletteItem) {
		hide();
		item.action();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % items.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + items.length) % items.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (items[selectedIndex]) execute(items[selectedIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			hide();
		}
	}

	const unregister = registerShortcut({
		key: 'k',
		modifiers: ['ctrl'],
		label: 'Command Palette',
		category: 'General',
		handler: () => {
			if (open) hide();
			else show();
		},
	});

	onDestroy(unregister);
</script>

{#if open}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 bg-black/40 z-60"
		onclick={hide}
		aria-label="Close command palette"
	></button>

	<!-- Panel -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed top-[20%] left-1/2 -translate-x-1/2 z-60
			w-[480px] max-w-[90vw] bg-surface-800 border border-surface-600
			rounded-xl shadow-2xl overflow-hidden"
		onkeydown={handleKeydown}
	>
		<!-- Search input -->
		<div class="flex items-center gap-2 px-4 py-3 border-b border-surface-700">
			<span class="text-surface-500 text-sm">&#128269;</span>
			<input
				bind:this={inputEl}
				type="text"
				bind:value={query}
				placeholder="Search pages, plugins, actions..."
				class="flex-1 bg-transparent text-sm text-surface-100 placeholder:text-surface-500 outline-none"
			/>
			<kbd class="text-[10px] text-surface-500 bg-surface-700 border border-surface-600 px-1.5 py-0.5 rounded font-mono">Esc</kbd>
		</div>

		<!-- Results -->
		<div class="max-h-[320px] overflow-y-auto py-1">
			{#if items.length === 0}
				<div class="px-4 py-6 text-center text-xs text-surface-500">No results</div>
			{:else}
				{@const categories = [...new Set(items.map((i) => i.category))]}
				{#each categories as cat}
					<div class="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-surface-500">{cat}</div>
					{#each items.filter((i) => i.category === cat) as item, i}
						{@const globalIdx = items.indexOf(item)}
						<button
							class="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer
								{globalIdx === selectedIndex ? 'bg-hecate-500/10 text-surface-50' : 'text-surface-300 hover:bg-surface-700/50'}"
							onclick={() => execute(item)}
							onmouseenter={() => (selectedIndex = globalIdx)}
						>
							<span class="text-sm shrink-0">{item.icon}</span>
							<span class="text-xs flex-1 truncate">{item.label}</span>
							{#if item.shortcut}
								<kbd class="text-[9px] text-surface-500 bg-surface-700 border border-surface-600 px-1.5 py-0.5 rounded font-mono shrink-0">
									{item.shortcut}
								</kbd>
							{/if}
						</button>
					{/each}
				{/each}
			{/if}
		</div>
	</div>
{/if}
