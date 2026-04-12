<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { fetchSupervisionRoots, fetchSupervisionChildren, type SupChild } from '$lib/stores/observer/supervision';
	import { fetchProcessDetail, type ProcessDetail } from '$lib/stores/observer/processes';

	// =====================================================================
	// RANGER NAVIGATION STACK
	// =====================================================================
	interface NavLevel {
		label: string;       // display name for breadcrumb
		pid: string | null;  // PID of the supervisor (null = roots)
		items: SupChild[];
		cursor: number;
	}

	let stack = $state<NavLevel[]>([]);
	let current = $derived(stack[stack.length - 1] ?? null);
	let parent = $derived(stack.length > 1 ? stack[stack.length - 2] : null);
	let selectedItem = $derived<SupChild | null>(current?.items[current.cursor] ?? null);

	let mode: 'normal' | 'search' | 'command' = $state('normal');
	let searchQuery = $state('');
	let commandInput = $state('');
	let statusMsg = $state('');
	let loading = $state(true);

	// Preview: process detail for workers
	let previewDetail = $state<(ProcessDetail & { gen_state?: unknown; gen_type?: string | null; messages?: Array<{ type: string; data: unknown }>; messages_count?: number }) | null>(null);
	let previewWithState = $state(false);

	let breadcrumb = $derived(stack.map(l => l.label).join(' > '));

	// =====================================================================
	// NAVIGATION
	// =====================================================================
	async function loadRoots() {
		try {
			const d = await fetchSupervisionRoots();
			stack = [{ label: 'roots', pid: null, items: d.items, cursor: 0 }];
		} catch {}
		loading = false;
	}

	async function goRight() {
		if (!selectedItem || !selectedItem.pid) return;

		if (selectedItem.type === 'supervisor' && selectedItem.child_count > 0) {
			// Drill into supervisor's children
			try {
				const d = await fetchSupervisionChildren(selectedItem.pid);
				stack = [...stack, { label: selectedItem.id, pid: selectedItem.pid, items: d.items, cursor: 0 }];
			} catch {}
		} else if (selectedItem.type === 'worker') {
			// Load full state for worker
			await loadWorkerState();
		}
	}

	function goLeft() {
		if (stack.length > 1) {
			stack = stack.slice(0, -1);
		}
	}

	function setCursor(idx: number) {
		if (!current) return;
		stack = stack.map((l, i) => i === stack.length - 1 ? { ...l, cursor: idx } : l);
	}

	// Load preview detail when cursor changes
	let lastPreviewPid = '';
	$effect(() => {
		if (selectedItem?.pid && selectedItem.pid !== lastPreviewPid) {
			lastPreviewPid = selectedItem.pid;
			previewWithState = false;
			if (selectedItem.type === 'worker') {
				fetchProcessDetail(selectedItem.pid).then(d => { previewDetail = d; }).catch(() => { previewDetail = null; });
			} else {
				previewDetail = null;
			}
		}
	});

	async function loadWorkerState() {
		if (!selectedItem?.pid || selectedItem.type !== 'worker') return;
		try {
			previewDetail = await fetchProcessDetail(selectedItem.pid, ['state', 'messages']);
			previewWithState = true;
		} catch {}
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'search') { mode = 'normal'; searchQuery = ''; }
			else if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			return;
		}
		if (mode === 'command') return;
		if (mode === 'search') {
			if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; return; }
			if (e.key === 'Backspace') { searchQuery = searchQuery.slice(0, -1); if (!searchQuery) mode = 'normal'; return; }
			if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchQuery += e.key; }
			return;
		}
		if (!current) return;
		switch (e.key) {
			case 'j': case 'ArrowDown': e.preventDefault(); setCursor(Math.min(current.cursor + 1, current.items.length - 1)); scrollIntoView(); break;
			case 'k': case 'ArrowUp': e.preventDefault(); setCursor(Math.max(current.cursor - 1, 0)); scrollIntoView(); break;
			case 'g': e.preventDefault(); setCursor(0); scrollIntoView(); break;
			case 'G': e.preventDefault(); setCursor(Math.max(0, current.items.length - 1)); scrollIntoView(); break;
			case 'l': case 'Enter': case 'ArrowRight': e.preventDefault(); goRight(); break;
			case 'h': case 'ArrowLeft': e.preventDefault(); goLeft(); break;
			case '/': e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':': e.preventDefault(); mode = 'command'; commandInput = ''; break;
			case '?': e.preventDefault(); statusMsg = 'h/l:navigate  j/k:move  /:search  ::cmd'; break;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim(); mode = 'normal'; commandInput = '';
		if (raw === 'q' || raw === 'back') { goLeft(); return; }
		if (raw === 'r' || raw === 'refresh') {
			if (current?.pid) {
				try { const d = await fetchSupervisionChildren(current.pid); stack = stack.map((l, i) => i === stack.length - 1 ? { ...l, items: d.items } : l); } catch {}
			} else {
				await loadRoots();
			}
			statusMsg = 'Refreshed';
			return;
		}
		// Navigate to a specific supervisor by name
		if (raw.startsWith('cd ')) {
			const name = raw.slice(3).trim();
			try {
				const d = await fetchSupervisionChildren(name);
				stack = [...stack, { label: name, pid: name, items: d.items, cursor: 0 }];
			} catch { statusMsg = `Not found: ${name}`; }
			return;
		}
		statusMsg = `Unknown: ${raw}`;
	}

	function formatBytes(bytes: number): string {
		if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return bytes + ' B';
	}

	function scrollIntoView() { tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })); }
	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => { if (statusMsg) { if (statusTimer) clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusMsg = ''; }, 6000); } });

	onMount(loadRoots);
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-macula-400 uppercase tracking-wider text-[10px]">Supervision</span>
		<div class="flex-1"></div>
		<span class="text-[10px] text-surface-600 truncate max-w-[400px]">{breadcrumb}</span>
	</div>

	<!-- Three-column ranger -->
	<div class="flex flex-1 min-h-0 divide-x divide-surface-700/50">

		<!-- LEFT: Parent pane -->
		<div class="w-1/5 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if parent}
				<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider">{parent.label}</div>
				{#each parent.items as item, i}
					{@const isCurrent = current && item.id === current.label}
					<div class="px-2 py-px text-[10px] truncate font-mono
						{isCurrent ? 'text-macula-400 bg-surface-700/50' : 'text-surface-500'}">
						<span class="text-[8px] {item.type === 'supervisor' ? 'text-macula-400' : 'text-surface-600'}">
							{item.type === 'supervisor' ? '\u25B6' : '\u25CF'}
						</span>
						{item.id}
					</div>
				{/each}
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">root</div>
			{/if}
		</div>

		<!-- CENTER: Current children -->
		<div class="flex-1 overflow-y-auto py-1 min-w-0">
			{#if loading}
				<div class="px-3 py-4 text-[11px] text-surface-500 animate-pulse">Loading...</div>
			{:else if current}
				<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider">{current.label} ({current.items.length})</div>
				{#each current.items as item, i}
					{@const isCursor = i === current.cursor}
					{@const isSupervisor = item.type === 'supervisor'}
					<button data-cursor={isCursor ? 'true' : 'false'}
						class="w-full text-left px-2 py-0.5 text-[10px] flex items-center gap-1.5 cursor-pointer transition-colors font-mono
							{isCursor ? 'bg-macula-600/30 text-surface-50 border-l-2 border-macula-400' : 'text-surface-300 hover:bg-surface-800 border-l-2 border-transparent'}"
						onclick={() => setCursor(i)}>
						<span class="text-[8px] shrink-0 {isSupervisor ? 'text-macula-400' : item.status === 'waiting' || item.status === 'running' ? 'text-success-400' : 'text-surface-600'}">
							{isSupervisor ? '\u25B6' : '\u25CF'}
						</span>
						<span class="flex-1 truncate {isSupervisor ? 'text-macula-300' : ''}">{item.id}</span>
						<span class="text-[9px] text-surface-600 shrink-0">{item.type}</span>
						{#if isSupervisor && item.child_count > 0}
							<span class="text-[9px] text-surface-500 shrink-0">{item.child_count}</span>
						{/if}
					</button>
				{/each}
				{#if current.items.length === 0}
					<div class="px-3 py-4 text-[11px] text-surface-600">No children</div>
				{/if}
			{/if}
		</div>

		<!-- RIGHT: Preview -->
		<div class="w-1/3 overflow-y-auto py-1 shrink-0 bg-surface-900/50">
			{#if selectedItem}
				<div class="px-3 py-2 space-y-1 text-[10px]">
					<div class="text-macula-400 font-mono">{selectedItem.id}</div>
					<div class="text-surface-400">{selectedItem.type} · {selectedItem.status}</div>
					{#if selectedItem.pid}
						<div class="text-surface-500 font-mono">{selectedItem.pid}</div>
					{/if}
					{#if selectedItem.app}
						<div class="text-surface-500">app: {selectedItem.app}</div>
					{/if}
					{#if selectedItem.type === 'supervisor' && selectedItem.child_count > 0}
						<div class="text-surface-400 mt-2">{selectedItem.child_count} children</div>
						<div class="text-surface-600">l/Enter to drill down</div>
					{:else if selectedItem.type === 'supervisor'}
						<div class="text-surface-600 mt-2">empty supervisor</div>
					{/if}

					{#if previewDetail && selectedItem.type === 'worker'}
						<div class="text-surface-600 mt-3 text-[9px] uppercase">Process Info</div>
						{#if previewDetail.gen_type}
							<div class="text-macula-300 text-[9px]">{previewDetail.gen_type}</div>
						{/if}
						<div class="text-surface-400">Memory: {formatBytes(previewDetail.memory)}</div>
						<div class="text-surface-400">Red: {previewDetail.reductions.toLocaleString()}</div>
						<div class="text-surface-400 {previewDetail.message_queue_len > 100 ? 'text-amber-400' : ''}">MQ: {previewDetail.message_queue_len}</div>
						<div class="text-surface-500">{previewDetail.current_function}</div>
						{#if previewWithState && previewDetail.gen_state != null}
							<div class="text-macula-400 mt-3 text-[9px] uppercase">State</div>
							<pre class="text-[9px] text-surface-200 font-mono whitespace-pre-wrap break-all leading-relaxed bg-surface-800/50 rounded p-1.5 max-h-40 overflow-y-auto">{typeof previewDetail.gen_state === 'object' && previewDetail.gen_state !== null && 'formatted' in (previewDetail.gen_state as Record<string, unknown>) ? (previewDetail.gen_state as Record<string, unknown>).formatted : JSON.stringify(previewDetail.gen_state, null, 2)}</pre>
						{:else if !previewWithState}
							<div class="text-surface-600 mt-2 text-[9px]">l to load state</div>
						{/if}
						{#if previewWithState && (previewDetail.messages_count ?? 0) > 0}
							<div class="text-amber-400 mt-2 text-[9px] uppercase">Inbox ({previewDetail.messages_count})</div>
							{#each previewDetail.messages ?? [] as msg}
								<div class="text-[9px] font-mono text-surface-400 truncate"><span class="text-macula-300">{msg.type}</span></div>
							{/each}
						{/if}
						{#if previewDetail.current_stacktrace.length > 0}
							<div class="text-surface-600 mt-2 text-[9px] uppercase">Stack</div>
							{#each previewDetail.current_stacktrace.slice(0, 5) as frame}
								<div class="text-[9px] font-mono text-surface-500 truncate">{frame.module}:{frame.function}/{frame.arity}</div>
							{/each}
						{/if}
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center h-full text-surface-600 text-[9px]">No selection</div>
			{/if}
		</div>
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-macula-400">:</span>
			<input type="text" bind:value={commandInput} use:focusOnMount
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; } }}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100" placeholder="Command... (cd <name>, refresh, q)" />
		{:else if mode === 'search'}
			<span class="text-macula-400">/{searchQuery}<span class="animate-pulse">_</span></span>
		{:else}
			{#if statusMsg}<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{breadcrumb}</span>
				{#if selectedItem}<span class="text-surface-700">|</span><span class="text-surface-400 truncate">{selectedItem.id}</span>{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}<span class="text-surface-600">{(current?.cursor ?? 0) + 1}/{current?.items.length ?? 0}</span><span class="text-surface-700">|</span><span class="text-surface-600 hover:text-surface-400 cursor-pointer" onclick={() => statusMsg = 'h/l:navigate  j/k:move  :cd <name>  ::cmd'}>?</span>{/if}
		{/if}
	</div>
</div>
