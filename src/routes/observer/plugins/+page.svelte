<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { fetchPlugins, type PluginInfo } from '$lib/stores/observer/plugins';

	let plugins = $state<PluginInfo[]>([]);
	let loading = $state(true);
	let cursorIndex = $state(0);
	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');

	let filtered = $derived.by(() => {
		if (!searchQuery) return plugins;
		const q = searchQuery.toLowerCase();
		return plugins.filter(p => p.name.toLowerCase().includes(q));
	});

	let selectedPlugin = $derived<PluginInfo | null>(filtered[cursorIndex] ?? null);

	async function refresh() {
		try { const d = await fetchPlugins(); plugins = d.items; } catch {}
		loading = false;
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.preventDefault(); if (mode === 'search') { mode = 'normal'; searchQuery = ''; } else if (mode === 'command') { mode = 'normal'; commandInput = ''; } return; }
		if (mode === 'command') return;
		if (mode === 'search') {
			if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; cursorIndex = 0; return; }
			if (e.key === 'Backspace') { searchQuery = searchQuery.slice(0, -1); if (!searchQuery) mode = 'normal'; cursorIndex = 0; return; }
			if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchQuery += e.key; cursorIndex = 0; }
			return;
		}
		switch (e.key) {
			case 'j': case 'ArrowDown': e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, filtered.length - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, filtered.length - 1); scrollIntoView(); break;
			case '/': e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = 'j/k:nav  /:search  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (raw === 'q' || raw === 'back') { history.back(); return; }
		if (raw === 'r' || raw === 'refresh') { await refresh(); statusMsg = 'Refreshed'; return; }
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }
	$effect(() => { if (cursorIndex >= filtered.length) cursorIndex = Math.max(0, filtered.length - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 5000); } });

	onMount(refresh);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-hecate-400 uppercase tracking-wider text-[10px]">Plugins</span>
		<span class="text-surface-600">({plugins.length})</span>
	</div>

	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">
		<!-- List -->
		<div class="flex-1 overflow-y-auto py-1">
			{#if loading}
				<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
			{:else}
				{#each filtered as plugin, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-0.5 text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors
							{i === cursorIndex ? 'bg-hecate-600/30 text-surface-50 border-l-2 border-hecate-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}>
						<span class="text-[8px] shrink-0 {plugin.health === 'ok' ? 'text-success-400' : plugin.health === 'degraded' ? 'text-amber-400' : 'text-surface-600'}">
							{plugin.health === 'ok' ? '\u25CF' : '\u25CB'}
						</span>
						<span class="flex-1 truncate font-mono">{plugin.name}</span>
						<span class="text-[9px] text-surface-500 shrink-0">{plugin.version ?? ''}</span>
						<span class="text-[9px] text-surface-600 shrink-0">{plugin.health}</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<div class="px-3 py-4 text-[11px] text-surface-600">{searchQuery ? 'No matches' : 'No plugins loaded'}</div>
				{/if}
			{/if}
		</div>

		<!-- Preview -->
		<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if selectedPlugin}
				<div class="px-3 py-2 space-y-1 text-[10px]">
					<div class="text-hecate-400 font-mono">{selectedPlugin.name}</div>
					<div class="text-surface-400 {selectedPlugin.health === 'ok' ? 'text-success-400' : ''}">{selectedPlugin.health}</div>
					{#if selectedPlugin.version}
						<div class="text-surface-500">v{selectedPlugin.version}</div>
					{/if}
					{#if selectedPlugin.callback_module}
						<div class="text-surface-500 font-mono">{selectedPlugin.callback_module}</div>
					{/if}
					{#if selectedPlugin.store_id}
						<div class="text-surface-500">store: {selectedPlugin.store_id}</div>
					{/if}
					<div class="text-surface-500">frontend: {selectedPlugin.has_frontend ? 'yes' : 'no'}</div>
				</div>
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">No selection</div>
			{/if}
		</div>
	</div>

	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-hecate-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100" placeholder="Command..." />
		{:else if mode === 'search'}
			<span class="text-hecate-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{filtered.length} matches</span>
		{:else}
			{#if statusMsg}<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}<span class="text-surface-500">plugins</span><div class="flex-1"></div>{/if}
			{#if !statusMsg}<span class="text-surface-600">{cursorIndex + 1}/{filtered.length}</span><span class="text-surface-700">|</span><span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  /:search  ::cmd'}>?</span>{/if}
		{/if}
	</div>
</div>
