<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import MeshEditor from '$lib/components/editor/MeshEditor.svelte';

	// =====================================================================
	// TABS
	// =====================================================================
	interface EditorTab {
		path: string;
		name: string;
	}

	let tabs = $state<EditorTab[]>([]);
	let activeTabIdx = $state(0);
	let activeTab = $derived<EditorTab | null>(tabs[activeTabIdx] ?? null);
	let editorRefs = $state<Record<string, MeshEditor | undefined>>({});
	let editorRef = $derived(activeTab ? editorRefs[activeTab.path] : undefined);

	function nameFromPath(p: string): string {
		return p.substring(p.lastIndexOf('/') + 1);
	}

	$effect(() => {
		const urlPath = page.url.searchParams.get('path');
		if (urlPath && tabs.length === 0) {
			const decoded = decodeURIComponent(urlPath);
			tabs = [{ path: decoded, name: nameFromPath(decoded) }];
			activeTabIdx = 0;
		}
	});

	function openTab(path: string): void {
		const existing = tabs.findIndex(t => t.path === path);
		if (existing >= 0) {
			activeTabIdx = existing;
		} else {
			tabs = [...tabs, { path, name: nameFromPath(path) }];
			activeTabIdx = tabs.length - 1;
		}
	}

	function closeTab(idx: number): void {
		if (tabs.length <= 1) { goBack(); return; }
		tabs = tabs.filter((_, i) => i !== idx);
		if (activeTabIdx >= tabs.length) activeTabIdx = tabs.length - 1;
		else if (activeTabIdx > idx) activeTabIdx--;
	}

	function nextTab(): void {
		if (tabs.length <= 1) return;
		activeTabIdx = (activeTabIdx + 1) % tabs.length;
	}

	function prevTab(): void {
		if (tabs.length <= 1) return;
		activeTabIdx = (activeTabIdx - 1 + tabs.length) % tabs.length;
	}

	function goBack() { goto('/briefcase'); }

	// =====================================================================
	// STATUS
	// =====================================================================
	let saving = $state(false);
	let charCount = $state(0);
	let wordCount = $state(0);
	let lang = $state('');
	let vimMode = $state('NORMAL');

	function onStatusChange(status: { saving: boolean; charCount: number; wordCount: number; lang: string; mode: string }) {
		saving = status.saving;
		charCount = status.charCount;
		wordCount = status.wordCount;
		lang = status.lang;
		vimMode = status.mode;
	}

	// =====================================================================
	// EDITOR EVENTS (from vim ex-commands via CustomEvent)
	// =====================================================================
	function bindEditorEvents(node: HTMLElement) {
		const handlers: Record<string, EventListener> = {
			'editor-quit': () => closeTab(activeTabIdx),
			'editor-quit-all': () => goBack(),
			'editor-tabnew': (e) => { const p = (e as CustomEvent).detail; if (p) openTab(p); },
			'editor-tabnext': () => nextTab(),
			'editor-tabprev': () => prevTab(),
		};
		for (const [evt, fn] of Object.entries(handlers)) node.addEventListener(evt, fn);
		return {
			destroy() { for (const [evt, fn] of Object.entries(handlers)) node.removeEventListener(evt, fn); }
		};
	}

	// =====================================================================
	// KEYBOARD (global, non-vim)
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'h')) {
			e.preventDefault();
			goBack();
		}
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full bg-surface-900 text-surface-200">
	<!-- Tab bar -->
	{#if tabs.length > 1}
		<div class="flex items-center bg-surface-800/60 border-b border-surface-700/50 shrink-0 overflow-x-auto">
			{#each tabs as tab, i (tab.path)}
				<button
					class="flex items-center gap-1 px-3 py-1 text-xs border-r border-surface-700/30 shrink-0 transition-colors cursor-pointer
						{i === activeTabIdx
							? 'bg-surface-900 text-macula-400 border-b-2 border-b-macula-500'
							: 'text-surface-500 hover:text-surface-300 hover:bg-surface-800 border-b-2 border-b-transparent'}"
					onclick={() => { activeTabIdx = i; }}
				>
					<span class="text-surface-600 text-[9px]">{i + 1}</span>
					<span class="truncate max-w-[120px]">{tab.name}</span>
					<span
						class="text-surface-600 hover:text-danger-400 ml-1 text-[9px] cursor-pointer"
						role="button"
						tabindex="-1"
						onclick={(ev) => { ev.stopPropagation(); closeTab(i); }}
					>&times;</span>
				</button>
			{/each}
		</div>
	{:else if tabs.length === 1}
		<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-xs shrink-0">
			<button
				onclick={goBack}
				class="text-surface-500 hover:text-macula-400 transition-colors cursor-pointer"
				title="Back to Briefcase (Alt+Left)"
			>&#8592; briefcase</button>
			<span class="text-surface-700">|</span>
			<span class="text-surface-300 truncate">{tabs[0].name}</span>
		</div>
	{/if}

	<!-- Editor area -->
	<div class="flex-1 min-h-0 relative">
		{#each tabs as tab, i (tab.path)}
			<div
				class="absolute inset-0"
				class:hidden={i !== activeTabIdx}
				use:bindEditorEvents
			>
				<MeshEditor
					bind:this={editorRefs[tab.path]}
					path={tab.path}
					onstatuschange={i === activeTabIdx ? onStatusChange : undefined}
				/>
			</div>
		{/each}

		{#if tabs.length === 0}
			<div class="flex items-center justify-center h-full text-surface-500 text-base">
				No file specified
			</div>
		{/if}
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-xs min-h-[24px]">
		<span class="text-surface-500 truncate">{activeTab?.name ?? ''}</span>
		<span class="text-surface-700">|</span>
		<span class="text-surface-500">{wordCount}w {charCount}c</span>
		<div class="flex-1"></div>
		<span class="text-surface-500">{saving ? 'Saving...' : 'Saved'}</span>
		<span class="text-surface-700">|</span>
		<span class="text-surface-600">{lang}</span>
		{#if tabs.length > 1}
			<span class="text-surface-700">|</span>
			<span class="text-surface-600">{activeTabIdx + 1}/{tabs.length}</span>
		{/if}
		<span class="text-surface-700">|</span>
		<span class="text-surface-600 {vimMode === 'INSERT' ? 'text-macula-400' : ''} {vimMode.startsWith('V') ? 'text-amber-400' : ''}">{vimMode}</span>
	</div>
</div>
