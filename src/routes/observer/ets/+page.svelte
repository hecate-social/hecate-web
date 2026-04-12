<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import TermDisplay from '$lib/components/observer/TermDisplay.svelte';
	import { fetchEtsTables, fetchEtsTableContent, type EtsTable, type EtsRow } from '$lib/stores/observer/ets';

	// =====================================================================
	// STATE
	// =====================================================================
	type View = 'tables' | 'content';
	let currentView: View = $state('tables');
	let cursorIndex = $state(0);
	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');
	let loading = $state(true);

	// Table list
	let tables = $state<EtsTable[]>([]);

	// Table content (drilled)
	let contentTableName = $state('');
	let contentRows = $state<EtsRow[]>([]);
	let contentTotal = $state(0);
	let contentTableInfo = $state<{ name: string; type: string; size: number; protection: string } | null>(null);
	let contentOffset = $state(0);
	let contentLimit = 50;

	// =====================================================================
	// DERIVED
	// =====================================================================
	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	let filteredTables = $derived.by(() => {
		if (!searchQuery || currentView !== 'tables') return tables;
		const q = searchQuery.toLowerCase();
		return tables.filter(t => t.name.toLowerCase().includes(q));
	});

	let selectedTable = $derived<EtsTable | null>(currentView === 'tables' ? (filteredTables[cursorIndex] ?? null) : null);
	let selectedRow = $derived<EtsRow | null>((currentView as string) === 'content' ? (contentRows[cursorIndex] ?? null) : null);
	let listLength = $derived(currentView === 'tables' ? filteredTables.length : contentRows.length);

	// =====================================================================
	// FETCH
	// =====================================================================
	async function loadTables() {
		try { const d = await fetchEtsTables(); tables = d.items; } catch {}
		loading = false;
	}

	async function drillIntoTable(name: string) {
		contentTableName = name;
		contentOffset = 0;
		contentRows = [];
		currentView = 'content';
		cursorIndex = 0;
		try {
			const d = await fetchEtsTableContent(name, contentLimit, 0);
			contentRows = d.items; contentTotal = d.total; contentTableInfo = d.table;
		} catch {}
	}

	async function reloadContent() {
		try {
			const d = await fetchEtsTableContent(contentTableName, contentLimit, contentOffset);
			contentRows = d.items; contentTotal = d.total;
		} catch {}
	}

	function goBack() {
		if (currentView === 'content') {
			currentView = 'tables';
			cursorIndex = tables.findIndex(t => t.name === contentTableName);
			if (cursorIndex < 0) cursorIndex = 0;
			searchQuery = '';
		} else {
			history.back();
		}
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'search') { mode = 'normal'; searchQuery = ''; }
			else if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			else { goBack(); }
			return;
		}
		if (mode === 'command') return;
		if (mode === 'search') {
			if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; cursorIndex = 0; return; }
			if (e.key === 'Backspace') { searchQuery = searchQuery.slice(0, -1); if (!searchQuery) mode = 'normal'; cursorIndex = 0; return; }
			if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchQuery += e.key; cursorIndex = 0; }
			return;
		}
		switch (e.key) {
			case 'j': case 'ArrowDown': e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, listLength - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, listLength - 1); scrollIntoView(); break;
			case 'l': case 'Enter': case 'ArrowRight':
				e.preventDefault();
				if (currentView === 'tables' && selectedTable?.named_table) {
					drillIntoTable(selectedTable.name);
				}
				break;
			case 'h': case 'ArrowLeft': e.preventDefault(); goBack(); break;
			case 'n':
				e.preventDefault();
				if (currentView === 'content') { contentOffset += contentLimit; reloadContent(); statusMsg = `offset: ${contentOffset}`; }
				break;
			case 'p':
				e.preventDefault();
				if (currentView === 'content') { contentOffset = Math.max(0, contentOffset - contentLimit); reloadContent(); statusMsg = `offset: ${contentOffset}`; }
				break;
			case '/': e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = currentView === 'content' ? 'j/k:nav  h:back  n/p:page  ::cmd' : 'j/k:nav  l:open  /:search  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (raw === 'q' || raw === 'back') { goBack(); return; }
		if (raw === 'r' || raw === 'refresh') {
			if (currentView === 'content') { await reloadContent(); } else { await loadTables(); }
			statusMsg = 'Refreshed'; return;
		}
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }
	$effect(() => { if (cursorIndex >= listLength) cursorIndex = Math.max(0, listLength - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 5000); } });

	onMount(loadTables);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-xs shrink-0">
		{#if currentView === 'content'}
			<button onclick={goBack} class="text-surface-500 hover:text-macula-400 transition-colors cursor-pointer text-xs">&#8592; tables</button>
			<span class="text-surface-700">|</span>
			<span class="text-macula-400 font-mono text-xs">{contentTableName}</span>
			{#if contentTableInfo}
				<span class="text-surface-600 text-xs">{contentTableInfo.size} rows · {contentTableInfo.type} · {contentTableInfo.protection}</span>
			{/if}
		{:else}
			<span class="text-macula-400 uppercase tracking-wider text-xs">ETS Tables</span>
			<span class="text-surface-600">({tables.length})</span>
			{#if searchQuery}<span class="text-macula-400 text-xs">/{searchQuery}</span>{/if}
		{/if}
	</div>

	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">
		<!-- List pane -->
		<div class="flex-1 overflow-y-auto py-1 min-w-0">
			{#if loading}
				<div class="px-3 py-4 text-xs text-surface-500 animate-pulse">Loading...</div>
			{:else if currentView === 'tables'}
				{#each filteredTables as table, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-0.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors font-mono
							{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}
						ondblclick={() => table.named_table && drillIntoTable(table.name)}>
						<span class="flex-1 truncate text-macula-300">{table.name}</span>
						<span class="w-16 text-right shrink-0 text-surface-500">{table.size.toLocaleString()}</span>
						<span class="w-20 text-right shrink-0">{formatBytes(table.memory_bytes)}</span>
						<span class="w-20 shrink-0 text-surface-500">{table.type}</span>
					</button>
				{/each}
				{#if filteredTables.length === 0}
					<div class="px-3 py-4 text-xs text-surface-600">{searchQuery ? 'No matches' : 'No tables'}</div>
				{/if}
			{:else}
				<!-- Table content rows -->
				<div class="px-2 py-0.5 text-[9px] text-surface-500">
					{contentOffset + 1}-{Math.min(contentOffset + contentLimit, contentTotal)} of {contentTotal} · n:next p:prev
				</div>
				{#each contentRows as row, i}
					<div data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="px-2 py-1 border-b border-surface-800/50 cursor-pointer transition-colors
							{i === cursorIndex ? 'bg-macula-600/20' : 'hover:bg-surface-800/50'}"
						role="button" tabindex="-1" onclick={() => cursorIndex = i}>
						<div class="flex items-baseline gap-2 text-xs">
							<span class="text-surface-600 shrink-0 text-[9px]">#{contentOffset + i + 1}</span>
							<span class="truncate font-mono text-macula-300">{typeof row.key === 'string' ? row.key : JSON.stringify(row.key).substring(0, 80)}</span>
						</div>
					</div>
				{/each}
				{#if contentRows.length === 0}
					<div class="px-3 py-4 text-xs text-surface-600">Empty table</div>
				{/if}
			{/if}
		</div>

		<!-- Preview pane -->
		<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if currentView === 'tables' && selectedTable}
				<div class="px-3 py-2 space-y-1 text-xs">
					<div class="text-macula-400 font-mono">{selectedTable.name}</div>
					<div class="text-surface-400">{selectedTable.size.toLocaleString()} rows · {formatBytes(selectedTable.memory_bytes)}</div>
					<div class="text-surface-400">{selectedTable.type} · {selectedTable.protection}</div>
					<div class="text-surface-500">owner: {selectedTable.owner ?? '?'}</div>
					<div class="text-surface-500">read_concurrency: {selectedTable.read_concurrency}</div>
					<div class="text-surface-500">write_concurrency: {selectedTable.write_concurrency}</div>
					{#if selectedTable.named_table}
						<div class="text-surface-600 mt-2">l/Enter to browse content</div>
					{:else}
						<div class="text-surface-600 mt-2">unnamed — cannot browse</div>
					{/if}
				</div>
			{:else if currentView === 'content' && selectedRow}
				<div class="px-3 py-2 space-y-2 text-xs overflow-x-auto">
					<div class="text-[9px] text-surface-500 uppercase">Key</div>
					<div class="overflow-x-auto"><TermDisplay value={selectedRow.key} /></div>
					{#each selectedRow.values as val, vi}
						<div class="text-[9px] text-surface-500 uppercase mt-2">Value {vi}</div>
						<div class="overflow-x-auto"><TermDisplay value={val} /></div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">No selection</div>
			{/if}
		</div>
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-xs min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-xs text-surface-100" placeholder="Command..." />
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{filteredTables.length} matches</span>
		{:else}
			{#if statusMsg}<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500">{currentView === 'content' ? contentTableName : 'ets'}</span>
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}<span class="text-surface-600">{cursorIndex + 1}/{listLength}</span><span class="text-surface-700">|</span><span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  l:open  h:back  n/p:page  /:search'}>?</span>{/if}
		{/if}
	</div>
</div>
