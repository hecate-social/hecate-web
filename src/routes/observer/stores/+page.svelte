<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import {
		fetchStores, fetchStoreStreams, fetchStreamEvents,
		type StoreInfo, type StreamInfo, type EventRecord,
	} from '$lib/stores/observer/stores';

	// =====================================================================
	// DRILL-DOWN NAVIGATION
	// =====================================================================
	type Level = 'stores' | 'streams' | 'events';
	let level: Level = $state('stores');
	let cursorIndex = $state(0);
	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');
	let loading = $state(true);

	// Data
	let stores = $state<StoreInfo[]>([]);
	let activeStoreId = $state('');
	let streams = $state<StreamInfo[]>([]);
	let activeStreamId = $state('');
	let events = $state<EventRecord[]>([]);
	let eventOffset = $state(0);
	let eventLimit = 50;

	// =====================================================================
	// FILTERED LISTS
	// =====================================================================
	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	let filteredStores = $derived.by(() => {
		if (!searchQuery || level !== 'stores') return stores;
		const q = searchQuery.toLowerCase();
		return stores.filter(s => s.store_id.toLowerCase().includes(q));
	});

	let filteredStreams = $derived.by(() => {
		if (!searchQuery || level !== 'streams') return streams;
		const q = searchQuery.toLowerCase();
		return streams.filter(s => s.stream_id.toLowerCase().includes(q));
	});

	let currentList = $derived.by(() => {
		switch (level) {
			case 'stores': return filteredStores;
			case 'streams': return filteredStreams;
			case 'events': return events;
			default: return [];
		}
	});

	let breadcrumb = $derived.by(() => {
		const parts = ['stores'];
		if (level === 'streams' || level === 'events') parts.push(activeStoreId);
		if (level === 'events') parts.push(activeStreamId);
		return parts.join(' > ');
	});

	// =====================================================================
	// NAVIGATION
	// =====================================================================
	async function loadStores() {
		try { const d = await fetchStores(); stores = d.items; } catch {}
		loading = false;
	}

	async function drillIntoStore(storeId: string) {
		activeStoreId = storeId;
		streams = [];
		level = 'streams';
		cursorIndex = 0;
		searchQuery = '';
		try { const d = await fetchStoreStreams(storeId); streams = d.items; } catch {}
	}

	async function drillIntoStream(streamId: string) {
		activeStreamId = streamId;
		events = [];
		eventOffset = 0;
		level = 'events';
		cursorIndex = 0;
		searchQuery = '';
		try { const d = await fetchStreamEvents(activeStoreId, streamId, 0, eventLimit); events = d.items; } catch {}
	}

	function goBack() {
		searchQuery = '';
		if (level === 'events') {
			level = 'streams';
			cursorIndex = streams.findIndex(s => s.stream_id === activeStreamId);
			if (cursorIndex < 0) cursorIndex = 0;
		} else if (level === 'streams') {
			level = 'stores';
			cursorIndex = stores.findIndex(s => s.store_id === activeStoreId);
			if (cursorIndex < 0) cursorIndex = 0;
		} else {
			history.back();
		}
	}

	async function goRight() {
		switch (level) {
			case 'stores':
				if (filteredStores[cursorIndex]) drillIntoStore(filteredStores[cursorIndex].store_id);
				break;
			case 'streams':
				if (filteredStreams[cursorIndex]) drillIntoStream(filteredStreams[cursorIndex].stream_id);
				break;
			// events: leaf — detail in preview
		}
	}

	async function pageEvents(dir: 'next' | 'prev') {
		if (level !== 'events') return;
		eventOffset = dir === 'next' ? eventOffset + eventLimit : Math.max(0, eventOffset - eventLimit);
		try { const d = await fetchStreamEvents(activeStoreId, activeStreamId, eventOffset, eventLimit); events = d.items; } catch {}
		cursorIndex = 0;
		statusMsg = `offset: ${eventOffset}`;
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
			case 'j': case 'ArrowDown': e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, currentList.length - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, currentList.length - 1); scrollIntoView(); break;
			case 'l': case 'Enter': case 'ArrowRight': e.preventDefault(); goRight(); break;
			case 'h': case 'ArrowLeft': e.preventDefault(); goBack(); break;
			case 'n': e.preventDefault(); pageEvents('next'); break;
			case 'p': e.preventDefault(); pageEvents('prev'); break;
			case '/': e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = 'h/l:drill  j/k:move  n/p:page  /:search  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (raw === 'q' || raw === 'back') { goBack(); return; }
		if (raw === 'r' || raw === 'refresh') {
			if (level === 'events') { try { const d = await fetchStreamEvents(activeStoreId, activeStreamId, eventOffset, eventLimit); events = d.items; } catch {} }
			else if (level === 'streams') { try { const d = await fetchStoreStreams(activeStoreId); streams = d.items; } catch {} }
			else { await loadStores(); }
			statusMsg = 'Refreshed'; return;
		}
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }
	$effect(() => { if (cursorIndex >= currentList.length && currentList.length > 0) cursorIndex = Math.max(0, currentList.length - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 5000); } });

	onMount(loadStores);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		{#if level !== 'stores'}
			<button onclick={goBack} class="text-surface-500 hover:text-macula-400 transition-colors cursor-pointer text-[10px]">&#8592;</button>
			<span class="text-surface-700">|</span>
		{/if}
		<span class="text-macula-400 uppercase tracking-wider text-[10px]">Event Stores</span>
		<span class="text-surface-600 text-[10px] truncate">{breadcrumb}</span>
		{#if searchQuery}<span class="text-macula-400 text-[10px]">/{searchQuery}</span>{/if}
		{#if level === 'events'}
			<div class="flex-1"></div>
			<span class="text-[9px] text-surface-600">offset:{eventOffset} · n:next p:prev</span>
		{/if}
	</div>

	<!-- Content -->
	{#if level === 'events'}
		<!-- Events: two-pane — list + payload preview -->
		<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">
			<!-- Event list -->
			<div class="flex-1 overflow-y-auto py-1 min-w-0">
				{#each events as event, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-0.5 text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors font-mono
							{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}>
						<span class="flex-1 truncate text-macula-300">{event.event_type ?? 'event'}</span>
						<span class="text-[9px] text-surface-500 shrink-0">v{event.version ?? '?'}</span>
						{#if event.timestamp}
							<span class="text-[9px] text-surface-600 shrink-0 w-20 text-right">{new Date(event.timestamp).toLocaleTimeString()}</span>
						{/if}
					</button>
				{/each}
				{#if events.length === 0}
					<div class="px-3 py-4 text-[11px] text-surface-600">No events</div>
				{/if}
			</div>

			<!-- Event payload preview -->
			<div class="w-1/2 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
				{#if events[cursorIndex]}
					{@const ev = events[cursorIndex]}
					<div class="px-3 py-2 space-y-2 text-[10px]">
						<!-- Payload first -->
						<div class="text-[9px] text-macula-400 uppercase tracking-wider">Data</div>
						{#if ev.data && typeof ev.data === 'object' && Object.keys(ev.data).length > 0}
							<pre class="text-[9px] text-surface-200 font-mono whitespace-pre-wrap break-all leading-relaxed">{JSON.stringify(ev.data, null, 2)}</pre>
						{:else}
							<div class="text-surface-600 text-[9px]">no payload</div>
						{/if}

						<!-- Envelope -->
						<div class="text-[9px] text-surface-600 uppercase tracking-wider mt-3">Envelope</div>
						{#each [
							['type', ev.event_type],
							['stream', ev.stream_id],
							['version', ev.version],
							['id', ev.event_id],
							['time', ev.timestamp ? new Date(ev.timestamp).toISOString() : null],
						].filter(([,v]) => v != null) as [label, value]}
							<div class="flex gap-2 text-[9px]">
								<span class="text-surface-600 w-12 shrink-0 text-right">{label}</span>
								<span class="text-surface-400 font-mono break-all">{value}</span>
							</div>
						{/each}

						<!-- Metadata -->
						{#if ev.metadata && typeof ev.metadata === 'object' && Object.keys(ev.metadata).length > 0}
							<div class="text-[9px] text-surface-600 uppercase tracking-wider mt-3">Metadata</div>
							<pre class="text-[9px] text-surface-500 font-mono whitespace-pre-wrap break-all leading-relaxed">{JSON.stringify(ev.metadata, null, 2)}</pre>
						{/if}
					</div>
				{:else}
					<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">No selection</div>
				{/if}
			</div>
		</div>

	{:else}
		<!-- Stores / Streams: full-width list -->
		<div class="flex-1 overflow-y-auto py-1">
			{#if loading}
				<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
			{:else if level === 'stores'}
				{#each filteredStores as store, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-px text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors font-mono
							{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}
						ondblclick={() => drillIntoStore(store.store_id)}>
						<span class="text-[8px] shrink-0 {store.running ? 'text-success-400' : 'text-danger-400'}">{store.running ? '\u25CF' : '\u25CB'}</span>
						<span class="flex-1 truncate text-macula-300">{store.store_id}</span>
						<span class="text-[9px] text-surface-500 shrink-0">{store.stream_count}s</span>
						<span class="text-[9px] text-surface-600 shrink-0">&#9654;</span>
					</button>
				{/each}
				{#if filteredStores.length === 0}
					<div class="px-3 py-4 text-[11px] text-surface-600">{searchQuery ? 'No matches' : 'No stores'}</div>
				{/if}

			{:else if level === 'streams'}
				{#each filteredStreams as stream, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-px text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors font-mono
							{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}
						ondblclick={() => drillIntoStream(stream.stream_id)}>
						<span class="flex-1 truncate text-macula-300">{stream.stream_id}</span>
						<span class="text-[9px] text-surface-500 shrink-0">v{stream.version}</span>
						<span class="text-[9px] text-surface-500 shrink-0">{stream.event_count}ev</span>
						<span class="text-[9px] text-surface-600 shrink-0">&#9654;</span>
					</button>
				{/each}
				{#if filteredStreams.length === 0}
					<div class="px-3 py-4 text-[11px] text-surface-600">{searchQuery ? 'No matches' : 'No streams'}</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100" placeholder="Command..." />
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{currentList.length} matches</span>
		{:else}
			{#if statusMsg}<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{breadcrumb}</span>
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}<span class="text-surface-600">{cursorIndex + 1}/{currentList.length}</span><span class="text-surface-700">|</span><span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'h/l:drill  j/k:move  n/p:page  /:search'}>?</span>{/if}
		{/if}
	</div>
</div>
