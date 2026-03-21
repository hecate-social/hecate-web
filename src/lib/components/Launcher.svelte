<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pluginTabs } from '$lib/plugins-registry';
	import { apps } from '$lib/stores/apps';
	import { pushOverlay, popOverlay, registerShortcut } from '$lib/stores/keyboard';
	import { resolveEmoji } from '$lib/emoji';
	import { onDestroy, tick } from 'svelte';

	let open = $state(false);
	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();

	// =====================================================================
	// ITEMS
	// =====================================================================
	interface LauncherItem {
		id: string;
		label: string;
		icon: string;
		path: string;
		group: string;
		online?: boolean;
	}

	let items = $derived.by(() => {
		const tabs = $pluginTabs;
		const appMap = $apps;

		const all: LauncherItem[] = tabs.map((t) => {
			const appState = appMap.get(t.id);
			return {
				id: t.id,
				label: t.name,
				icon: t.icon,
				path: t.path,
				group: t.isPlugin ? 'Plugins' : (t.group ?? 'Pages'),
				online: t.isPlugin ? appState?.online ?? false : true,
			};
		});

		if (!query.trim()) return all;

		const q = query.toLowerCase();
		return all.filter((item) =>
			item.label.toLowerCase().includes(q) ||
			item.path.toLowerCase().includes(q) ||
			item.id.toLowerCase().includes(q) ||
			item.group.toLowerCase().includes(q)
		);
	});

	// Group items preserving order
	let groups = $derived.by(() => {
		const map = new Map<string, LauncherItem[]>();
		for (const item of items) {
			if (!map.has(item.group)) map.set(item.group, []);
			map.get(item.group)!.push(item);
		}
		return [...map.entries()];
	});

	// =====================================================================
	// SHOW / HIDE
	// =====================================================================
	function show() {
		open = true;
		query = '';
		selectedIndex = 0;
		pushOverlay('launcher', hide);
		tick().then(() => inputEl?.focus());
	}

	function hide() {
		open = false;
		popOverlay('launcher');
	}

	export function toggle() {
		if (open) hide(); else show();
	}

	function navigate(item: LauncherItem) {
		hide();
		goto(item.path);
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function handleKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown': case 'j':
				if (e.key === 'j' && inputEl === document.activeElement) return; // let typing work
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % items.length;
				scrollIntoView();
				break;
			case 'ArrowUp': case 'k':
				if (e.key === 'k' && inputEl === document.activeElement) return;
				e.preventDefault();
				selectedIndex = (selectedIndex - 1 + items.length) % items.length;
				scrollIntoView();
				break;
			case 'Enter':
				e.preventDefault();
				if (items[selectedIndex]) navigate(items[selectedIndex]);
				break;
			case 'Escape':
				e.preventDefault();
				hide();
				break;
		}

		// Number shortcuts 1-9
		if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey && inputEl !== document.activeElement) {
			const idx = parseInt(e.key) - 1;
			if (idx < items.length) {
				e.preventDefault();
				navigate(items[idx]);
			}
		}
	}

	function scrollIntoView() {
		tick().then(() => {
			const el = document.querySelector('[data-launcher-selected="true"]');
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	// Clamp index
	$effect(() => {
		if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1);
	});

	// =====================================================================
	// SHORTCUTS
	// =====================================================================
	// Ctrl+P: primary launcher shortcut
	const unregP = registerShortcut({
		key: 'p',
		modifiers: ['ctrl'],
		label: 'Launcher',
		category: 'General',
		handler: () => toggle(),
	});

	// Ctrl+K: also opens launcher (replaces old command palette)
	const unregK = registerShortcut({
		key: 'k',
		modifiers: ['ctrl'],
		label: 'Launcher',
		category: 'General',
		handler: () => toggle(),
	});

	onDestroy(() => { unregP(); unregK(); });

	// =====================================================================
	// HELPERS
	// =====================================================================
	function isActive(item: LauncherItem): boolean {
		const currentPath = page.url?.pathname ?? '/';
		const currentSearch = page.url?.search ?? '';
		const [itemPath, itemSearch] = item.path.split('?');
		if (itemSearch) {
			return currentPath === itemPath && currentSearch.includes(itemSearch);
		}
		return itemPath === '/' ? currentPath === '/' : currentPath.startsWith(itemPath);
	}
</script>

{#if open}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 bg-black/50 z-60 cursor-default"
		onclick={hide}
		aria-label="Close launcher"
	></button>

	<!-- Panel -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed top-[15%] left-1/2 -translate-x-1/2 z-60
			w-[420px] max-w-[90vw] bg-surface-800 border border-surface-700
			rounded-lg shadow-2xl overflow-hidden"
		onkeydown={handleKeydown}
	>
		<!-- Search input -->
		<div class="flex items-center gap-2 px-3 py-2 border-b border-surface-700">
			<span class="text-hecate-400 text-[11px]">&gt;</span>
			<input
				bind:this={inputEl}
				type="text"
				bind:value={query}
				placeholder="Jump to..."
				class="flex-1 bg-transparent text-[12px] text-surface-100 placeholder:text-surface-500 outline-none font-mono"
			/>
			<span class="text-[9px] text-surface-600 font-mono">Esc</span>
		</div>

		<!-- Results -->
		<div class="max-h-[400px] overflow-y-auto py-1">
			{#if items.length === 0}
				<div class="px-3 py-4 text-center text-[11px] text-surface-500">No matches</div>
			{:else}
				{#each groups as [groupName, groupItems]}
					<div class="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-surface-600">{groupName}</div>
					{#each groupItems as item}
						{@const globalIdx = items.indexOf(item)}
						{@const selected = globalIdx === selectedIndex}
						{@const active = isActive(item)}
						<button
							data-launcher-selected={selected ? 'true' : 'false'}
							class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors cursor-pointer
								{selected
									? 'bg-hecate-600/25 text-surface-50 border-l-2 border-hecate-400'
									: 'text-surface-300 hover:bg-surface-700/50 border-l-2 border-transparent'}"
							onclick={() => navigate(item)}
							onmouseenter={() => { selectedIndex = globalIdx; }}
						>
							<span class="text-sm shrink-0 w-5 text-center">{item.icon}</span>
							<span class="text-[11px] flex-1 truncate {active ? 'text-hecate-400' : ''}">{item.label}</span>
							{#if item.group === 'Plugins'}
								<span class="text-[8px] shrink-0 {item.online ? 'text-success-400' : 'text-surface-600'}">{item.online ? '\u25CF' : '\u25CB'}</span>
							{/if}
							{#if globalIdx < 9}
								<span class="text-[9px] text-surface-600 font-mono shrink-0">{globalIdx + 1}</span>
							{/if}
						</button>
					{/each}
				{/each}
			{/if}
		</div>

		<!-- Footer hint -->
		<div class="border-t border-surface-700/50 px-3 py-1 text-[9px] text-surface-600 flex items-center gap-3">
			<span>&#8593;&#8595; navigate</span>
			<span>&#9166; open</span>
			<span>1-9 jump</span>
			<span>Esc close</span>
		</div>
	</div>
{/if}
