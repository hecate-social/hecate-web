<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { fetchSubscriptions, type SubscriptionGroup } from '$lib/stores/observer/subscriptions';

	let groups = $state<SubscriptionGroup[]>([]);
	let loading = $state(true);
	let cursorIndex = $state(0);
	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');

	let filtered = $derived.by(() => {
		if (!searchQuery) return groups;
		const q = searchQuery.toLowerCase();
		return groups.filter(g => g.group.toLowerCase().includes(q));
	});

	let selectedGroup = $derived<SubscriptionGroup | null>(filtered[cursorIndex] ?? null);

	async function refresh() {
		try { const d = await fetchSubscriptions(); groups = d.items; } catch {}
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
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-xs shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-xs">PG Groups</span>
		<span class="text-surface-600">({groups.length})</span>
	</div>

	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">
		<!-- List -->
		<div class="flex-1 overflow-y-auto py-1">
			{#if loading}
				<div class="px-3 py-4 text-xs text-surface-500 animate-pulse">Loading...</div>
			{:else}
				{#each filtered as group, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-0.5 text-xs flex items-center gap-1.5 cursor-pointer transition-colors
							{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}>
						<span class="flex-1 truncate font-mono text-macula-300">{group.group}</span>
						<span class="text-[9px] text-surface-500 shrink-0">{group.member_count} members</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<div class="px-3 py-4 text-xs text-surface-600">{searchQuery ? 'No matches' : 'No PG groups'}</div>
				{/if}
			{/if}
		</div>

		<!-- Preview: members of selected group -->
		<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if selectedGroup}
				<div class="px-3 py-2 space-y-1">
					<div class="text-macula-400 font-mono text-xs truncate">{selectedGroup.group}</div>
					<div class="text-xs text-surface-500 mb-2">{selectedGroup.member_count} members</div>
					{#each selectedGroup.members as member}
						<div class="flex items-center gap-1.5 text-[9px]">
							<span class="{member.alive ? 'text-success-400' : 'text-danger-400'}">{member.alive ? '\u25CF' : '\u25CB'}</span>
							<span class="font-mono text-surface-400">{member.pid}</span>
							{#if member.registered_name}
								<span class="text-surface-300 truncate">{member.registered_name}</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">No selection</div>
			{/if}
		</div>
	</div>

	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-xs min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-xs text-surface-100" placeholder="Command..." />
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{filtered.length} matches</span>
		{:else}
			{#if statusMsg}<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}<span class="text-surface-500">pg groups</span><div class="flex-1"></div>{/if}
			{#if !statusMsg}<span class="text-surface-600">{cursorIndex + 1}/{filtered.length}</span><span class="text-surface-700">|</span><span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  /:search  ::cmd'}>?</span>{/if}
		{/if}
	</div>
</div>
