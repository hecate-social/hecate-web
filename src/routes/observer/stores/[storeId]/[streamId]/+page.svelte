<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import EventViewer from '$lib/components/observer/EventViewer.svelte';
	import { fetchStreamEvents, type EventRecord } from '$lib/stores/observer/stores';

	let events = $state<EventRecord[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let offset = $state(0);
	let limit = 50;
	let direction = $state<'forward' | 'backward'>('forward');
	let cursorIndex = $state(0);
	let mode: 'normal' | 'command' = $state('normal');
	let commandInput = $state('');
	let statusMsg = $state('');

	const params = $derived($page.params as Record<string, string>);
	const storeId = $derived(params.storeId);
	const streamId = $derived(decodeURIComponent(params.streamId));

	async function refresh() {
		loading = true;
		try {
			const data = await fetchStreamEvents(storeId, streamId, offset, limit, direction);
			events = data.items;
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			else { goto(`/observer/stores/${storeId}`); }
			return;
		}
		if (mode === 'command') return;
		switch (e.key) {
			case 'j': case 'ArrowDown': e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, events.length - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, events.length - 1); scrollIntoView(); break;
			case 'h': e.preventDefault(); goto(`/observer/stores/${storeId}`); break;
			case 'n': e.preventDefault(); offset += limit; refresh(); statusMsg = `offset: ${offset}`; break;
			case 'p': e.preventDefault(); offset = Math.max(0, offset - limit); refresh(); statusMsg = `offset: ${offset}`; break;
			case 'd': e.preventDefault(); direction = direction === 'forward' ? 'backward' : 'forward'; refresh(); statusMsg = `direction: ${direction}`; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = 'j/k:nav  n/p:page  d:direction  h:back  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (!raw) return;
		if (raw === 'q' || raw === 'back') { goto(`/observer/stores/${storeId}`); return; }
		if (raw === 'r' || raw === 'refresh') { await refresh(); statusMsg = 'Refreshed'; return; }
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	$effect(() => { if (cursorIndex >= events.length) cursorIndex = Math.max(0, events.length - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 5000); } });

	onMount(refresh);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Observer nav -->
	<div class="flex items-center gap-2 px-3 py-0.5 border-b border-surface-700/50 bg-surface-800/60 text-[10px] shrink-0">
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

	<!-- Stream header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<button onclick={() => goto(`/observer/stores/${storeId}`)} class="text-surface-500 hover:text-macula-400 transition-colors cursor-pointer text-[10px]">&#8592; {storeId}</button>
		<span class="text-surface-700">|</span>
		<span class="text-macula-300 font-mono text-[10px] truncate">{streamId}</span>
		<div class="flex-1"></div>
		<span class="text-[9px] text-surface-600">{direction}</span>
		<span class="text-[9px] text-surface-600">offset:{offset}</span>
	</div>

	<!-- Events -->
	<div class="flex-1 overflow-y-auto py-1 min-h-0">
		{#if loading && events.length === 0}
			<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
		{:else if error}
			<div class="px-3 py-4 text-[11px] text-danger-400">{error}</div>
		{:else if events.length === 0}
			<div class="px-3 py-4 text-[11px] text-surface-600">No events in this stream</div>
		{:else}
			{#each events as event, i}
				<div data-cursor={i === cursorIndex ? 'true' : 'false'}
					class="border-b border-surface-800/50 transition-colors {i === cursorIndex ? 'bg-macula-600/10' : ''}">
					<EventViewer {event} />
				</div>
			{/each}
		{/if}
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100" placeholder="Command..." />
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{streamId}</span>
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				<span class="text-surface-600">{cursorIndex + 1}/{events.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  n/p:page  d:direction  h:back'}>?</span>
			{/if}
		{/if}
	</div>
</div>
