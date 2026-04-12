<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import EventViewer from '$lib/components/observer/EventViewer.svelte';
	import {
		fetchStores, fetchStoreStreams, fetchStoreEvents,
		fetchStoreSnapshots, fetchStoreSubscriptionDetails,
		type StoreInfo, type StreamInfo, type EventRecord,
		type SnapshotInfo, type StoreSubscriptionInfo
	} from '$lib/stores/observer/stores';

	// =====================================================================
	// STATE
	// =====================================================================
	let storeInfo = $state<StoreInfo | null>(null);
	let streams = $state<StreamInfo[]>([]);
	let events = $state<EventRecord[]>([]);
	let snapshots = $state<SnapshotInfo[]>([]);
	let storeSubs = $state<StoreSubscriptionInfo[]>([]);
	let loading = $state(true);

	type Tab = 'overview' | 'streams' | 'snapshots' | 'subscriptions' | 'events';
	const tabs: Tab[] = ['overview', 'streams', 'snapshots', 'subscriptions', 'events'];
	let activeTab: Tab = $state('overview');
	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let cursorIndex = $state(0);
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');
	let eventOffset = $state(0);
	let eventLimit = 50;
	let typeFilter = $state('');

	const storeId = $derived(($page.params as Record<string, string>).storeId);
	let totalEvents = $derived(streams.reduce((sum, s) => sum + s.event_count, 0));

	// =====================================================================
	// ROWS
	// =====================================================================
	interface Row { key: string; label: string; value: string; }

	let overviewRows = $derived.by((): Row[] => {
		const r: Row[] = [];
		r.push({ key: 'id', label: 'Store ID', value: storeId });
		r.push({ key: 'status', label: 'Status', value: storeInfo?.running ? 'Running' : 'Stopped' });
		r.push({ key: 'streams', label: 'Streams', value: String(streams.length) });
		r.push({ key: 'events', label: 'Total Events', value: String(totalEvents) });
		if (storeInfo?.ets_tables) {
			for (const t of storeInfo.ets_tables) {
				r.push({ key: `ets-${t.name}`, label: 'ETS', value: `${t.name}  ${t.size} rows  ${formatBytes(t.memory_bytes)}` });
			}
		}
		return r;
	});

	let rowCount = $derived.by(() => {
		switch (activeTab) {
			case 'overview': return overviewRows.length;
			case 'streams': return streams.length;
			case 'snapshots': return snapshots.length;
			case 'subscriptions': return storeSubs.length;
			case 'events': return events.length;
			default: return 0;
		}
	});

	// =====================================================================
	// FETCH
	// =====================================================================
	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	async function refreshAll() {
		loading = true;
		try {
			const [storesRes, streamsRes] = await Promise.all([fetchStores(), fetchStoreStreams(storeId)]);
			storeInfo = storesRes.items.find(s => s.store_id === storeId) ?? null;
			streams = streamsRes.items;
		} catch {}
		loading = false;
	}

	async function loadEvents() {
		try { const data = await fetchStoreEvents(storeId, eventOffset, eventLimit, typeFilter || undefined); events = data.items; } catch {}
	}

	async function loadSnapshots() {
		try { const data = await fetchStoreSnapshots(storeId); snapshots = data.items; } catch {}
	}

	async function loadStoreSubs() {
		try { const data = await fetchStoreSubscriptionDetails(storeId); storeSubs = data.items; } catch {}
	}

	let loadedTabs = new Set<Tab>(['overview']);

	function switchTab(tab: Tab) {
		activeTab = tab;
		cursorIndex = 0;
		searchQuery = '';
		if (loadedTabs.has(tab)) return;
		loadedTabs.add(tab);
		if (tab === 'events') loadEvents();
		if (tab === 'snapshots') loadSnapshots();
		if (tab === 'subscriptions') loadStoreSubs();
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'search') { mode = 'normal'; searchQuery = ''; }
			else if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			else { goto('/observer/stores'); }
			return;
		}
		if (mode === 'command') return;
		if (mode === 'search') {
			if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; return; }
			if (e.key === 'Backspace') { searchQuery = searchQuery.slice(0, -1); if (!searchQuery) mode = 'normal'; return; }
			if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchQuery += e.key; }
			return;
		}
		switch (e.key) {
			case 'j': case 'ArrowDown': e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, rowCount - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, rowCount - 1); scrollIntoView(); break;
			case 'Tab': e.preventDefault(); switchTab(tabs[(tabs.indexOf(activeTab) + 1) % tabs.length]); break;
			case 'Enter': case 'l':
				e.preventDefault();
				if (activeTab === 'streams' && streams[cursorIndex]) {
					goto(`/observer/stores/${storeId}/${encodeURIComponent(streams[cursorIndex].stream_id)}`);
				}
				break;
			case 'h': e.preventDefault(); goto('/observer/stores'); break;
			case '/': e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case 'n':
				e.preventDefault();
				if (activeTab === 'events') { eventOffset += eventLimit; loadEvents(); statusMsg = `offset: ${eventOffset}`; }
				break;
			case 'p':
				e.preventDefault();
				if (activeTab === 'events') { eventOffset = Math.max(0, eventOffset - eventLimit); loadEvents(); statusMsg = `offset: ${eventOffset}`; }
				break;
			case '?': e.preventDefault(); statusMsg = 'j/k:nav  Tab:section  l:open  h:back  n/p:page  /:search  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (!raw) return;
		if (raw === 'q' || raw === 'back') { goto('/observer/stores'); return; }
		if (raw === 'r' || raw === 'refresh') { loadedTabs.clear(); await refreshAll(); statusMsg = 'Refreshed'; return; }
		if (raw.startsWith('filter ')) { typeFilter = raw.slice(7).trim(); eventOffset = 0; loadEvents(); statusMsg = `filter: ${typeFilter || 'none'}`; return; }
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	$effect(() => { if (cursorIndex >= rowCount) cursorIndex = Math.max(0, rowCount - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 5000); } });

	onMount(refreshAll);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<!-- Observer nav -->
	<div class="flex items-center gap-2 px-3 py-0.5 border-b border-surface-700/50 bg-surface-800/60 text-xs shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-[9px]">Observer</span>
		<div class="flex-1"></div>
		{#each ['system', 'processes', 'ets', 'supervision', 'plugins', 'stores', 'subscriptions'] as v}
			<button
				class="px-1.5 py-0.5 rounded cursor-pointer transition-colors
					{v === 'stores' ? 'text-macula-400 bg-macula-600/20' : 'text-surface-600 hover:text-surface-400'}"
				onclick={() => { if (v !== 'stores') goto('/observer'); }}
			>{v}</button>
		{/each}
	</div>
	<!-- Store header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-xs shrink-0">
		<button onclick={() => goto('/observer/stores')} class="text-surface-500 hover:text-macula-400 transition-colors cursor-pointer text-xs">&#8592; stores</button>
		<span class="text-surface-700">|</span>
		<span class="text-macula-400 font-mono text-xs">{storeId}</span>
		{#if storeInfo}
			<span class="text-[8px] {storeInfo.running ? 'text-success-400' : 'text-danger-400'}">{storeInfo.running ? '\u25CF' : '\u25CB'}</span>
		{/if}
		<div class="flex-1"></div>
		{#each tabs as t}
			<button
				class="text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors
					{activeTab === t ? 'text-macula-400 bg-macula-600/20' : 'text-surface-600 hover:text-surface-400'}"
				onclick={() => switchTab(t)}
			>{t}</button>
		{/each}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto py-1 min-h-0">
		{#if loading}
			<div class="px-3 py-4 text-xs text-surface-500 animate-pulse">Loading...</div>

		<!-- OVERVIEW -->
		{:else if activeTab === 'overview'}
			<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider">Store</div>
			{#each overviewRows as row, i}
				<div data-cursor={i === cursorIndex ? 'true' : 'false'}
					class="px-2 py-0.5 text-xs flex items-center gap-2 transition-colors
						{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 border-l-2 border-transparent'}">
					<span class="w-24 shrink-0 text-surface-500 text-right text-xs">{row.label}</span>
					<span class="flex-1 truncate font-mono text-xs {row.key === 'status' ? (storeInfo?.running ? 'text-success-400' : 'text-danger-400') : ''}">{row.value}</span>
				</div>
			{/each}

		<!-- STREAMS -->
		{:else if activeTab === 'streams'}
			<div class="px-2 py-0.5 text-[9px] text-surface-600 flex items-center gap-1.5 border-b border-surface-800">
				<span class="flex-1">Stream ID</span>
				<span class="w-12 text-right shrink-0">Ver</span>
				<span class="w-16 text-right shrink-0">Events</span>
			</div>
			{#each streams as stream, i}
				<button data-cursor={i === cursorIndex ? 'true' : 'false'}
					class="w-full text-left px-2 py-0.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors font-mono
						{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
					onclick={() => cursorIndex = i}
					ondblclick={() => goto(`/observer/stores/${storeId}/${encodeURIComponent(stream.stream_id)}`)}>
					<span class="flex-1 truncate text-macula-300">{stream.stream_id}</span>
					<span class="w-12 text-right shrink-0 text-surface-500">v{stream.version}</span>
					<span class="w-16 text-right shrink-0">{stream.event_count}</span>
				</button>
			{/each}
			{#if streams.length === 0}
				<div class="px-3 py-4 text-xs text-surface-600">No streams</div>
			{/if}

		<!-- SNAPSHOTS -->
		{:else if activeTab === 'snapshots'}
			<div class="px-2 py-0.5 text-[9px] text-surface-600 flex items-center gap-1.5 border-b border-surface-800">
				<span class="flex-1">Stream ID</span>
				<span class="w-12 text-right shrink-0">Ver</span>
				<span class="w-32 text-right shrink-0">Timestamp</span>
			</div>
			{#each snapshots as snap, i}
				<div data-cursor={i === cursorIndex ? 'true' : 'false'}
					class="px-2 py-0.5 text-xs flex items-center gap-1.5 font-mono transition-colors
						{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 border-l-2 border-transparent'}">
					<span class="flex-1 truncate text-macula-300">{snap.stream_id}</span>
					<span class="w-12 text-right shrink-0 text-surface-500">v{snap.version}</span>
					<span class="w-32 text-right shrink-0 text-surface-500">{snap.timestamp ? new Date(snap.timestamp).toLocaleString() : '\u2014'}</span>
				</div>
			{/each}
			{#if snapshots.length === 0}
				<div class="px-3 py-4 text-xs text-surface-600">No snapshots</div>
			{/if}

		<!-- SUBSCRIPTIONS -->
		{:else if activeTab === 'subscriptions'}
			<div class="px-2 py-0.5 text-[9px] text-surface-600 flex items-center gap-1.5 border-b border-surface-800">
				<span class="w-48 shrink-0">Name</span>
				<span class="w-16 shrink-0">Type</span>
				<span class="flex-1">Selector</span>
				<span class="w-16 text-right shrink-0">Chk</span>
				<span class="w-8 text-right shrink-0">Pool</span>
			</div>
			{#each storeSubs as sub, i}
				<div data-cursor={i === cursorIndex ? 'true' : 'false'}
					class="px-2 py-0.5 text-xs flex items-center gap-1.5 font-mono transition-colors
						{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 border-l-2 border-transparent'}">
					<span class="w-48 shrink-0 truncate text-macula-300">{sub.subscription_name}</span>
					<span class="w-16 shrink-0 text-surface-500">{sub.type}</span>
					<span class="flex-1 truncate text-surface-400">{sub.selector}</span>
					<span class="w-16 text-right shrink-0">{sub.checkpoint ?? '\u2014'}</span>
					<span class="w-8 text-right shrink-0">{sub.pool_size}</span>
				</div>
			{/each}
			{#if storeSubs.length === 0}
				<div class="px-3 py-4 text-xs text-surface-600">No subscriptions</div>
			{/if}

		<!-- EVENTS ($all) -->
		{:else if activeTab === 'events'}
			<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider flex items-center gap-2">
				<span>$all Events</span>
				{#if typeFilter}<span class="text-macula-400">filter:{typeFilter}</span>{/if}
				<span class="text-surface-600">offset:{eventOffset}</span>
				<span class="text-surface-600">n:next p:prev</span>
			</div>
			{#each events as event, i}
				<div data-cursor={i === cursorIndex ? 'true' : 'false'}
					class="border-b border-surface-800/50 transition-colors
						{i === cursorIndex ? 'bg-macula-600/10' : ''}">
					<EventViewer {event} />
				</div>
			{/each}
			{#if events.length === 0}
				<div class="px-3 py-4 text-xs text-surface-600">No events — :filter &lt;type&gt; or press n/p to page</div>
			{/if}
		{/if}
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-xs min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-xs text-surface-100" placeholder="Command... (filter <type>, refresh, q)" />
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500">{storeId}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-500">{activeTab}</span>
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600">{cursorIndex + 1}/{rowCount}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  Tab:section  l:open  h:back  n/p:page  ::cmd'}>?</span>
			{/if}
		{/if}
	</div>
</div>
