<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { fetchProcesses, fetchProcessDetail, type ProcessInfo, type ProcessDetail, type ProcessStateInfo } from '$lib/stores/observer/processes';

	let processes = $state<ProcessInfo[]>([]);
	let processTotal = $state(0);
	let sortField = $state('memory');
	let loading = $state(true);
	let cursorIndex = $state(0);
	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');
	let detail = $state<(ProcessDetail & ProcessStateInfo) | null>(null);
	let detailWithState = $state(false); // whether state+messages were loaded
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	let filtered = $derived.by(() => {
		if (!searchQuery) return processes;
		const q = searchQuery.toLowerCase();
		return processes.filter(p =>
			(p.registered_name?.toLowerCase().includes(q)) ||
			(p.current_function?.toLowerCase().includes(q)) ||
			p.pid.includes(q)
		);
	});

	let selectedProc = $derived<ProcessInfo | null>(filtered[cursorIndex] ?? null);

	// Load basic detail for preview when cursor changes
	let lastPreviewPid = '';
	$effect(() => {
		if (selectedProc && selectedProc.pid !== lastPreviewPid) {
			lastPreviewPid = selectedProc.pid;
			detailWithState = false;
			fetchProcessDetail(selectedProc.pid).then(d => { detail = d; }).catch(() => { detail = null; });
		}
	});

	// Load full state+messages on demand
	async function loadFullDetail() {
		if (!selectedProc) return;
		statusMsg = 'Loading state...';
		try {
			detail = await fetchProcessDetail(selectedProc.pid, ['state', 'messages']);
			detailWithState = true;
			statusMsg = '';
		} catch {
			statusMsg = 'Failed to load state (process may not support sys:get_state)';
		}
	}

	async function refresh() {
		try {
			const data = await fetchProcesses(sortField, 200);
			processes = data.items; processTotal = data.total;
		} catch {}
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
			case 's':
				e.preventDefault();
				const fields = ['memory', 'reductions', 'message_queue_len'];
				sortField = fields[(fields.indexOf(sortField) + 1) % fields.length];
				refresh();
				statusMsg = `Sort: ${sortField}`;
				break;
			case 'l': case 'Enter':
				e.preventDefault();
				loadFullDetail();
				break;
			case '/': e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = 'j/k:nav  l:state  s:sort  /:search  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (raw === 'q' || raw === 'back') { history.back(); return; }
		if (raw === 'r' || raw === 'refresh') { await refresh(); statusMsg = 'Refreshed'; return; }
		if (raw.startsWith('sort ')) {
			const f = raw.slice(5).trim();
			if (['memory', 'reductions', 'message_queue_len', 'mq'].includes(f)) {
				sortField = f === 'mq' ? 'message_queue_len' : f;
				refresh(); statusMsg = `Sort: ${sortField}`;
			} else { statusMsg = 'Sort: memory, reductions, mq'; }
			return;
		}
		statusMsg = `Unknown: ${raw}`;
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }
	$effect(() => { if (cursorIndex >= filtered.length) cursorIndex = Math.max(0, filtered.length - 1); });
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 5000); } });

	onMount(async () => { await refresh(); pollTimer = setInterval(refresh, 5000); });
	onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-[10px]">Processes</span>
		<span class="text-surface-600">({processTotal})</span>
		<span class="text-surface-600">·</span>
		<span class="text-[10px] text-surface-500">sort:{sortField}</span>
		{#if searchQuery}<span class="text-macula-400 text-[10px]">/{searchQuery}</span>{/if}
	</div>

	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">
		<!-- Process list -->
		<div class="flex-1 overflow-y-auto py-1 min-w-0">
			<div class="px-2 py-0.5 text-[9px] text-surface-600 flex items-center gap-1.5 border-b border-surface-800">
				<span class="w-4 shrink-0"></span>
				<span class="w-44 shrink-0">Name / PID</span>
				<span class="w-20 text-right shrink-0">Memory</span>
				<span class="w-20 text-right shrink-0">Reductions</span>
				<span class="w-8 text-right shrink-0">MQ</span>
				<span class="flex-1">Function</span>
			</div>
			{#if loading}
				<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
			{:else}
				{#each filtered as proc, i}
					<button data-cursor={i === cursorIndex ? 'true' : 'false'}
						class="w-full text-left px-2 py-px text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors font-mono
							{i === cursorIndex ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => cursorIndex = i}>
						<span class="w-4 shrink-0 text-[8px] {proc.status === 'running' ? 'text-success-400' : 'text-surface-600'}">{proc.status === 'running' ? '\u25CF' : '\u25CB'}</span>
						<span class="w-44 shrink-0 truncate {proc.registered_name ? 'text-macula-300' : ''}">{proc.registered_name || proc.pid}</span>
						<span class="w-20 text-right shrink-0">{formatBytes(proc.memory)}</span>
						<span class="w-20 text-right shrink-0">{proc.reductions.toLocaleString()}</span>
						<span class="w-8 text-right shrink-0 {proc.message_queue_len > 100 ? 'text-amber-400' : ''}">{proc.message_queue_len}</span>
						<span class="flex-1 truncate text-surface-500">{proc.current_function ?? ''}</span>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Process detail preview -->
		<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if detail}
				<div class="px-3 py-2 space-y-1 text-[10px]">
					<div class="text-macula-400 font-mono">{detail.registered_name || detail.pid}</div>
					{#if detail.gen_type}
						<div class="text-macula-300 text-[9px]">{detail.gen_type}</div>
					{/if}
					<div class="text-surface-500">{detail.current_function}</div>
					<div class="text-surface-400">Memory: {formatBytes(detail.memory)}</div>
					<div class="text-surface-400">Reductions: {detail.reductions.toLocaleString()}</div>
					<div class="text-surface-400 {detail.message_queue_len > 100 ? 'text-amber-400' : ''}">Msg Queue: {detail.message_queue_len}</div>
					<div class="text-surface-400">Status: {detail.status}</div>
					<div class="text-surface-400">Heap: {detail.heap_size.toLocaleString()} words</div>
					<div class="text-surface-400">Trap Exit: {detail.trap_exit ? 'yes' : 'no'}</div>

					<!-- State (loaded on demand via l/Enter) -->
					{#if detailWithState && detail.gen_state != null}
						<div class="text-macula-400 mt-3 text-[9px] uppercase">State {#if detail.gen_type}<span class="text-surface-600 normal-case">({detail.gen_type})</span>{/if}</div>
						<pre class="text-[9px] text-surface-200 font-mono whitespace-pre-wrap break-all leading-relaxed bg-surface-800/50 rounded p-2 max-h-48 overflow-y-auto">{typeof detail.gen_state === 'object' && detail.gen_state !== null && 'formatted' in (detail.gen_state as Record<string, unknown>) ? (detail.gen_state as Record<string, unknown>).formatted : JSON.stringify(detail.gen_state, null, 2)}</pre>
					{:else if !detailWithState}
						<div class="text-surface-600 mt-3 text-[9px]">l/Enter to load state + inbox</div>
					{/if}

					<!-- Messages (loaded on demand) -->
					{#if detailWithState && detail.messages != null}
						<div class="text-surface-500 mt-3 text-[9px] uppercase {(detail.messages_count ?? 0) > 0 ? 'text-amber-400' : ''}">
							Inbox ({detail.messages_count ?? 0}{#if detail.messages_truncated} truncated{/if})
						</div>
						{#if (detail.messages?.length ?? 0) === 0}
							<div class="text-[9px] text-surface-600">(empty)</div>
						{:else}
							{#each detail.messages ?? [] as msg, i}
								<div class="text-[9px] font-mono text-surface-400 truncate" title={typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)}>
									<span class="text-surface-500">{i}:</span>
									<span class="text-macula-300">{msg.type}</span>
									{typeof msg.data === 'string' ? msg.data.substring(0, 80) : ''}
								</div>
							{/each}
						{/if}
					{/if}

					{#if detail.current_stacktrace.length > 0}
						<div class="text-surface-600 mt-3 text-[9px] uppercase">Stacktrace</div>
						{#each detail.current_stacktrace as frame}
							<div class="text-[9px] font-mono text-surface-500 truncate">{frame.module}:{frame.function}/{frame.arity}</div>
						{/each}
					{/if}
					{#if detail.links.length > 0}
						<div class="text-surface-600 mt-2 text-[9px] uppercase">Links ({detail.links.length})</div>
						{#each detail.links as link}
							<div class="text-[9px] font-mono text-surface-500">{link}</div>
						{/each}
					{/if}
				</div>
			{:else if selectedProc}
				<div class="px-3 py-2 text-[10px] text-surface-500 animate-pulse">Loading...</div>
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">No selection</div>
			{/if}
		</div>
	</div>

	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100" placeholder="Command..." />
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
			<span class="text-surface-600">{filtered.length} matches</span>
		{:else}
			{#if statusMsg}<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500">processes</span>
				<span class="text-surface-700">|</span>
				{#if selectedProc}<span class="text-surface-400 truncate">{selectedProc.registered_name || selectedProc.pid}</span>{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}<span class="text-surface-600">{cursorIndex + 1}/{filtered.length}</span><span class="text-surface-700">|</span><span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'j/k:nav  s:sort  /:search  ::cmd'}>?</span>{/if}
		{/if}
	</div>
</div>
