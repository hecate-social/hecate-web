<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import {
		fetchMeshStatus, discoverSubscribers, connectMeshSSE,
		type MeshStatus, type MeshSubscriber, type MeshPeer, type MeshInitialEvent
	} from '$lib/stores/mesh';

	// =====================================================================
	// STATE
	// =====================================================================
	type View = 'overview' | 'status' | 'discovery';
	type Mode = 'normal' | 'command' | 'search';
	let currentView: View = $state('overview');
	let mode: Mode = $state('normal');
	let cursorIndex = $state(0);
	let statusMsg = $state('');
	let commandInput = $state('');
	let searchQuery = $state('');
	let copyFeedback: string | null = $state(null);

	// Connection state
	let sseConnected = $state(false);
	let meshConnected = $state(false);
	let selfInfo = $state<{ node_id?: string; identity?: string; realm?: string }>({});

	// Peers (real-time via SSE)
	let peers = $state<MeshPeer[]>([]);
	let peerLog = $state<{ time: number; type: 'connected' | 'disconnected'; node_id: string }[]>([]);

	// Status (fetched on mount + refresh)
	let meshStatus = $state<MeshStatus | null>(null);
	let statusLoading = $state(false);

	// Discovery
	let discoveryTopic = $state('');
	let discoveryResults = $state<MeshSubscriber[]>([]);
	let discoverySearched = $state(false);
	let discovering = $state(false);

	// Cleanup
	let closeSSE: (() => void) | null = null;

	// =====================================================================
	// HELPERS
	// =====================================================================
	function truncateId(id: string, len = 16): string {
		if (id.length <= len) return id;
		return id.slice(0, 8) + '..' + id.slice(-6);
	}

	function timeSince(ts: number): string {
		const s = Math.floor((Date.now() - ts) / 1000);
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		return `${Math.floor(s / 3600)}h ago`;
	}

	async function copyToClipboard(text: string, label: string) {
		await navigator.clipboard.writeText(text);
		copyFeedback = label;
		statusMsg = `Copied ${label}`;
		setTimeout(() => { copyFeedback = null; }, 1500);
	}

	function relayHostname(url: string): string {
		return url.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
	}

	// =====================================================================
	// DERIVED: current relay
	// =====================================================================
	let currentRelay = $derived(
		meshStatus?.bootstrap?.[0] ?? null
	);

	// =====================================================================
	// SSE CONNECTION
	// =====================================================================
	function startSSE() {
		closeSSE = connectMeshSSE((type, data) => {
			switch (type) {
				case 'open':
					sseConnected = true;
					statusMsg = 'Stream connected';
					break;
				case 'initial': {
					const init = data as MeshInitialEvent;
					meshConnected = init.connected;
					selfInfo = init.self ?? {};
					peers = (init.peers ?? []).map(p => ({
						...p,
						connected_at: p.connected_at ?? Date.now()
					}));
					statusMsg = `${peers.length} peer${peers.length !== 1 ? 's' : ''} on relay`;
					break;
				}
				case 'peer_connected': {
					const peer = data as MeshPeer;
					if (!peers.find(p => p.node_id === peer.node_id)) {
						peers = [...peers, { ...peer, connected_at: Date.now() }];
						peerLog = [{ time: Date.now(), type: 'connected' as const, node_id: peer.node_id }, ...peerLog].slice(0, 50);
						statusMsg = `+ ${truncateId(peer.node_id)}`;
					}
					break;
				}
				case 'peer_disconnected': {
					const peer = data as MeshPeer;
					peers = peers.filter(p => p.node_id !== peer.node_id);
					peerLog = [{ time: Date.now(), type: 'disconnected' as const, node_id: peer.node_id }, ...peerLog].slice(0, 50);
					statusMsg = `- ${truncateId(peer.node_id)}`;
					break;
				}
				case 'error':
					sseConnected = false;
					statusMsg = 'Stream disconnected, reconnecting...';
					break;
			}
		});
	}

	async function refreshStatus() {
		statusLoading = true;
		try { meshStatus = await fetchMeshStatus(); }
		catch { statusMsg = 'Failed to fetch status'; }
		finally { statusLoading = false; }
	}

	// =====================================================================
	// DATA ROWS
	// =====================================================================
	interface Row {
		key: string;
		label: string;
		value: string;
		section: string;
		copyable?: boolean;
		highlight?: 'success' | 'danger' | 'dim' | 'hecate' | 'relay';
		peerId?: string;
	}

	let overviewRows = $derived.by((): Row[] => {
		const r: Row[] = [];
		// Relay connection
		if (currentRelay) {
			r.push({
				key: 'relay', label: 'Connected to',
				value: relayHostname(currentRelay),
				section: 'RELAY', highlight: 'relay', copyable: true
			});
		} else {
			r.push({ key: 'relay', label: 'Relay', value: meshConnected ? 'connected' : 'disconnected', section: 'RELAY', highlight: meshConnected ? 'success' : 'danger' });
		}
		// Subscriptions
		const subs = meshStatus?.subscriptions ?? [];
		if (subs.length > 0) {
			for (const topic of subs) {
				r.push({
					key: `sub-${topic}`, label: '← SUB',
					value: topic, section: 'SUBSCRIPTIONS',
					highlight: 'hecate', copyable: true
				});
			}
		} else {
			r.push({ key: 'no-subs', label: '', value: 'No subscriptions', section: 'SUBSCRIPTIONS', highlight: 'dim' });
		}
		// Peers on this relay
		if (peers.length > 0) {
			for (const peer of peers) {
				r.push({
					key: `peer-${peer.node_id}`, label: '● NODE',
					value: truncateId(peer.node_id),
					section: 'PEERS ON RELAY',
					copyable: true, peerId: peer.node_id
				});
			}
		} else {
			r.push({ key: 'no-peers', label: '', value: 'No other nodes on this relay', section: 'PEERS ON RELAY', highlight: 'dim' });
		}
		// Activity
		if (peerLog.length > 0) {
			for (const entry of peerLog.slice(0, 10)) {
				r.push({
					key: `log-${entry.time}-${entry.node_id}`,
					label: entry.type === 'connected' ? '+' : '−',
					value: `${truncateId(entry.node_id)}  ${timeSince(entry.time)}`,
					section: 'ACTIVITY',
					highlight: entry.type === 'connected' ? 'success' : 'danger',
				});
			}
		}
		return r;
	});

	let statusRows = $derived.by((): Row[] => {
		if (!meshStatus) {
			if (statusLoading) return [{ key: 'loading', label: '', value: 'Loading...', section: 'STATUS', highlight: 'dim' }];
			return [{ key: 'empty', label: '', value: ':status to load', section: 'STATUS', highlight: 'dim' }];
		}
		const r: Row[] = [];
		r.push({
			key: 'connected', label: 'Connection',
			value: meshStatus.connected ? '● connected' : '○ disconnected',
			section: 'STATUS', highlight: meshStatus.connected ? 'success' : 'danger'
		});
		r.push({ key: 'node-id', label: 'Node ID', value: meshStatus.node_id ?? '--', section: 'NODE', copyable: true });
		r.push({ key: 'realm', label: 'Realm', value: meshStatus.realm || '--', section: 'NODE' });
		r.push({ key: 'identity', label: 'Identity', value: meshStatus.identity || '--', section: 'NODE', copyable: true });
		const relays = meshStatus.bootstrap ?? [];
		for (const server of relays) {
			r.push({ key: `relay-${server}`, label: 'Relay', value: server, section: 'RELAYS', copyable: true });
		}
		for (const topic of meshStatus.subscriptions) {
			r.push({ key: `sub-${topic}`, label: 'Topic', value: topic, section: 'SUBSCRIPTIONS', copyable: true });
		}
		if (meshStatus.subscriptions.length === 0) {
			r.push({ key: 'no-subs', label: '', value: 'none', section: 'SUBSCRIPTIONS', highlight: 'dim' });
		}
		return r;
	});

	let discoveryRows = $derived.by((): Row[] => {
		const r: Row[] = [];
		if (discoveryTopic) {
			r.push({ key: 'topic', label: 'Topic', value: discoveryTopic, section: 'QUERY', copyable: true });
		}
		if (!discoverySearched) {
			r.push({ key: 'hint', label: '', value: ':discover <topic> to search', section: 'QUERY', highlight: 'dim' });
			return r;
		}
		if (discoveryResults.length === 0) {
			r.push({ key: 'no-results', label: '', value: 'No subscribers found', section: 'RESULTS', highlight: 'dim' });
		} else {
			for (const sub of discoveryResults) {
				r.push({
					key: `sub-${sub.node_id}`,
					label: truncateId(sub.node_id),
					value: sub.endpoint,
					section: 'SUBSCRIBERS',
					copyable: true,
				});
			}
		}
		return r;
	});

	let rows = $derived(
		currentView === 'overview' ? overviewRows :
		currentView === 'status' ? statusRows :
		discoveryRows
	);

	let selectedRow = $derived<Row | null>(rows[cursorIndex] ?? null);
	let selectedPeerId = $derived(selectedRow?.peerId ?? null);

	let sections = $derived.by(() => {
		const map = new Map<string, Row[]>();
		for (const row of rows) {
			if (!map.has(row.section)) map.set(row.section, []);
			map.get(row.section)!.push(row);
		}
		return [...map.entries()];
	});

	// =====================================================================
	// COMMANDS
	// =====================================================================
	interface Command {
		name: string; aliases: string[]; args: string; description: string;
		exec: (args: string) => Promise<void> | void;
	}

	const commands: Command[] = [
		{ name: 'overview', aliases: ['o', 'peers', 'p'], args: '', description: 'Relay overview (default)',
			exec() { currentView = 'overview'; cursorIndex = 0; } },
		{ name: 'status', aliases: ['s'], args: '', description: 'Show full mesh status',
			async exec() {
				currentView = 'status'; cursorIndex = 0;
				await refreshStatus();
			} },
		{ name: 'discover', aliases: ['d', 'find'], args: '<topic>', description: 'Discover topic subscribers',
			async exec(args) {
				if (!args.trim()) { statusMsg = 'discover: missing topic'; return; }
				discoveryTopic = args.trim();
				discovering = true; discoverySearched = false; discoveryResults = [];
				currentView = 'discovery'; cursorIndex = 0;
				statusMsg = `Discovering ${discoveryTopic}...`;
				try {
					const result = await discoverSubscribers(discoveryTopic);
					discoveryResults = result.subscribers;
					discoverySearched = true;
					statusMsg = `${result.subscribers.length} subscriber${result.subscribers.length !== 1 ? 's' : ''}`;
				} catch (e) {
					statusMsg = `Discovery failed: ${e instanceof Error ? e.message : e}`;
					discoverySearched = true;
				} finally { discovering = false; }
			} },
		{ name: 'refresh', aliases: ['r'], args: '', description: 'Refresh status data',
			async exec() { await refreshStatus(); statusMsg = 'Refreshed'; } },
		{ name: 'copy', aliases: ['y'], args: '', description: 'Copy selected value',
			exec() {
				if (selectedRow?.copyable) copyToClipboard(selectedRow.value, selectedRow.label || selectedRow.key);
				else statusMsg = 'Nothing to copy';
			} },
		{ name: 'q', aliases: ['quit', 'back'], args: '', description: 'Go back',
			exec() { history.back(); } },
		{ name: 'help', aliases: ['h', '?'], args: '', description: 'Show commands',
			exec() { statusMsg = commands.map(c => ':' + c.name).join('  '); } },
	];

	function findCommand(input: string): Command | undefined {
		return commands.find(c => c.name === input || c.aliases.includes(input));
	}

	// =====================================================================
	// KEYBOARD
	// =====================================================================
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (mode === 'command') { mode = 'normal'; commandInput = ''; }
			else if (mode === 'search') { mode = 'normal'; searchQuery = ''; }
			return;
		}
		if (mode === 'command') return;
		if (mode === 'search') { handleSearchKeys(e); return; }
		if (mode !== 'normal') return;

		switch (e.key) {
			case 'j': case 'ArrowDown':
				e.preventDefault(); cursorIndex = Math.min(cursorIndex + 1, rows.length - 1); scrollIntoView(); break;
			case 'k': case 'ArrowUp':
				e.preventDefault(); cursorIndex = Math.max(cursorIndex - 1, 0); scrollIntoView(); break;
			case 'g': e.preventDefault(); cursorIndex = 0; scrollIntoView(); break;
			case 'G': e.preventDefault(); cursorIndex = Math.max(0, rows.length - 1); scrollIntoView(); break;
			case 'y':
				e.preventDefault();
				if (selectedRow?.copyable) copyToClipboard(selectedRow.value, selectedRow.label || selectedRow.key);
				break;
			case 'r': e.preventDefault(); refreshStatus(); break;
			case '1': e.preventDefault(); currentView = 'overview'; cursorIndex = 0; break;
			case '2': e.preventDefault(); currentView = 'status'; commands[1].exec(''); break;
			case '3': e.preventDefault(); currentView = 'discovery'; cursorIndex = 0; break;
			case '/':
				e.preventDefault(); mode = 'search'; searchQuery = ''; break;
			case ':':
				e.preventDefault(); mode = 'command'; commandInput = ''; statusMsg = ''; break;
			case '?':
				e.preventDefault();
				statusMsg = 'j/k:nav  y:copy  r:refresh  1/2/3:view  /:search  ::cmd';
				break;
		}
	}

	function handleSearchKeys(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); mode = 'normal'; return; }
		if (e.key === 'Backspace') {
			searchQuery = searchQuery.slice(0, -1);
			if (!searchQuery) mode = 'normal';
			return;
		}
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
			e.preventDefault(); searchQuery += e.key;
		}
	}

	async function onCommandSubmit() {
		const raw = commandInput.trim();
		mode = 'normal'; commandInput = '';
		if (!raw) return;
		const spaceIdx = raw.indexOf(' ');
		const cmdName = spaceIdx >= 0 ? raw.substring(0, spaceIdx) : raw;
		const cmdArgs = spaceIdx >= 0 ? raw.substring(spaceIdx + 1) : '';
		const cmd = findCommand(cmdName);
		if (cmd) { try { await cmd.exec(cmdArgs); } catch (err) { statusMsg = `Error: ${err}`; } }
		else { statusMsg = `Unknown: ${cmdName}  (:help)`; }
	}

	function scrollIntoView() {
		tick().then(() => document.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' }));
	}

	function focusOnMount(node: HTMLElement) { tick().then(() => node.focus()); }

	// =====================================================================
	// LIFECYCLE
	// =====================================================================
	onMount(() => {
		startSSE();
		refreshStatus();
	});

	onDestroy(() => {
		if (closeSSE) closeSSE();
	});
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex flex-col h-full overflow-hidden bg-surface-900 text-surface-200 select-none">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-1.5 border-b border-surface-700 bg-surface-800/80 text-[11px] shrink-0">
		<span class="text-hecate-400 uppercase tracking-wider text-[10px] font-bold">Mesh</span>

		{#if meshConnected}
			<span class="text-success-400 text-[10px]">●</span>
			{#if currentRelay}
				<span class="text-[10px] text-surface-400 font-mono">{relayHostname(currentRelay)}</span>
			{:else}
				<span class="text-[10px] text-success-400">connected</span>
			{/if}
		{:else}
			<span class="text-danger-400 text-[10px] animate-pulse">○ offline</span>
		{/if}

		{#if peers.length > 0}
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-surface-400 font-mono">{peers.length} peer{peers.length !== 1 ? 's' : ''}</span>
		{/if}

		{#if meshStatus?.subscriptions?.length}
			<span class="text-surface-600">·</span>
			<span class="text-[10px] text-hecate-400/70 font-mono">{meshStatus.subscriptions.length} sub{meshStatus.subscriptions.length !== 1 ? 's' : ''}</span>
		{/if}

		<div class="flex-1"></div>

		{#if selfInfo.realm}
			<span class="text-[9px] text-surface-500 font-mono">{selfInfo.realm}</span>
			<span class="text-surface-700">·</span>
		{/if}

		{#each [['overview', '1'], ['status', '2'], ['discovery', '3']] as [view, key]}
			<button
				class="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors
					{currentView === view ? 'text-hecate-400 bg-hecate-600/20' : 'text-surface-500 hover:text-surface-300'}"
				onclick={() => { currentView = view as View; cursorIndex = 0; if (view === 'status') commands[1].exec(''); }}
			><span class="text-surface-600 mr-0.5">{key}</span>{view}</button>
		{/each}
	</div>

	<!-- ================================================================= -->
	<!-- OVERVIEW: Relay connection summary cards                           -->
	<!-- ================================================================= -->
	{#if currentView === 'overview'}
		<div class="shrink-0 border-b border-surface-800 bg-surface-850 px-3 py-3">
			<div class="grid grid-cols-3 gap-2">
				<!-- Relay card -->
				<div class="mesh-card {meshConnected ? 'mesh-card-active' : 'mesh-card-inactive'}">
					<div class="mesh-card-label">RELAY</div>
					<div class="mesh-card-value">
						{#if currentRelay}
							{relayHostname(currentRelay).split('.')[0]}
						{:else}
							--
						{/if}
					</div>
					<div class="mesh-card-sub">
						{#if meshConnected}
							<span class="text-success-400">● connected</span>
						{:else}
							<span class="text-danger-400 animate-pulse">○ offline</span>
						{/if}
					</div>
				</div>

				<!-- Subscriptions card -->
				<div class="mesh-card">
					<div class="mesh-card-label">SUBSCRIPTIONS</div>
					<div class="mesh-card-value text-hecate-400">
						{meshStatus?.subscriptions?.length ?? 0}
					</div>
					<div class="mesh-card-sub">
						{#if (meshStatus?.subscriptions?.length ?? 0) > 0}
							← listening
						{:else}
							no topics
						{/if}
					</div>
				</div>

				<!-- Peers card -->
				<div class="mesh-card">
					<div class="mesh-card-label">PEERS ON RELAY</div>
					<div class="mesh-card-value">{peers.length}</div>
					<div class="mesh-card-sub">
						{#if peers.length > 0}
							{peers.length} node{peers.length !== 1 ? 's' : ''} reachable
						{:else}
							waiting...
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ================================================================= -->
	<!-- LIST CONTENT                                                       -->
	<!-- ================================================================= -->
	<div class="flex-1 overflow-y-auto py-1">
		{#if rows.length === 0}
			<div class="px-3 py-4 text-[11px] text-surface-600">
				{#if currentView === 'overview'}
					Waiting for mesh events...
				{:else}
					No data
				{/if}
			</div>
		{:else}
			{#each sections as [sectionName, sectionRows]}
				<div class="px-2 py-0.5 text-[9px] text-surface-500 uppercase tracking-wider mt-2 first:mt-1">
					{sectionName}
					{#if sectionName === 'SUBSCRIPTIONS'}
						<span class="normal-case text-hecate-400/60">({meshStatus?.subscriptions?.length ?? 0})</span>
					{/if}
					{#if sectionName === 'PEERS ON RELAY'}
						<span class="normal-case text-surface-600">({peers.length})</span>
					{/if}
					{#if sectionName === 'SUBSCRIBERS'}
						<span class="normal-case">({discoveryResults.length})</span>
					{/if}
				</div>
				{#each sectionRows as row}
					{@const idx = rows.indexOf(row)}
					{@const isCursor = idx === cursorIndex}
					{@const matchSearch = searchQuery && (
						row.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
						row.value.toLowerCase().includes(searchQuery.toLowerCase())
					)}
					<div
						data-cursor={isCursor ? 'true' : 'false'}
						class="px-2 py-0.5 text-[11px] flex items-center gap-2 transition-colors
							{isCursor
								? 'bg-hecate-600/30 text-surface-50 border-l-2 border-hecate-400'
								: 'text-surface-300 border-l-2 border-transparent'}
							{matchSearch ? 'bg-amber-500/10' : ''}"
						role="button"
						tabindex="-1"
						onclick={() => { cursorIndex = idx; }}
					>
						{#if row.section === 'ACTIVITY'}
							<span class="text-[10px] {row.highlight === 'success' ? 'text-success-400' : 'text-danger-400'} w-3 text-center shrink-0">
								{row.label}
							</span>
						{:else}
							<span class="w-20 shrink-0 text-[10px] truncate
								{row.highlight === 'relay' ? 'text-blue-400' :
								 row.highlight === 'hecate' ? 'text-hecate-400/60' :
								 'text-surface-500'} text-right">{row.label}</span>
						{/if}
						<span class="flex-1 truncate font-mono text-[10px]
							{row.highlight === 'success' ? 'text-success-400' :
							 row.highlight === 'danger' ? 'text-danger-400' :
							 row.highlight === 'dim' ? 'text-surface-600' :
							 row.highlight === 'hecate' ? 'text-hecate-400' :
							 row.highlight === 'relay' ? 'text-blue-300' :
							 ''}">{row.value}</span>
						{#if row.copyable && isCursor}
							<span class="text-[9px] text-surface-600 shrink-0">y:copy</span>
						{/if}
						{#if copyFeedback === (row.label || row.key)}
							<span class="text-[9px] text-success-400 shrink-0">copied!</span>
						{/if}
					</div>
				{/each}
			{/each}
		{/if}
	</div>

	<!-- Status bar -->
	<div class="border-t border-surface-700 bg-surface-800/80 px-3 py-1 shrink-0 flex items-center gap-2 text-[10px] min-h-[24px]">
		{#if mode === 'command'}
			<span class="text-hecate-400">:</span>
			<input
				type="text" bind:value={commandInput}
				use:focusOnMount
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommandSubmit(); }
					else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mode = 'normal'; commandInput = ''; }
				}}
				class="flex-1 bg-transparent border-none outline-none text-[10px] text-surface-100"
				placeholder="Command..."
			/>
		{:else if mode === 'search'}
			<span class="text-hecate-400">/{searchQuery}<span class="animate-pulse">_</span></span>
		{:else}
			{#if statusMsg}
				<span class="text-amber-400 truncate flex-1">{statusMsg}</span>
			{:else}
				<span class="text-surface-500 truncate">{currentView}</span>
				<span class="text-surface-700">|</span>
				{#if selectedRow}
					<span class="text-surface-400 truncate">{selectedRow.label || selectedRow.key}</span>
				{/if}
				<div class="flex-1"></div>
			{/if}
			{#if !statusMsg}
				{#if discovering}
					<span class="text-amber-400 animate-pulse">discovering...</span>
					<span class="text-surface-700">|</span>
				{/if}
				<span class="text-surface-600">{cursorIndex + 1}/{rows.length}</span>
				<span class="text-surface-700">|</span>
				<span class="text-surface-600 hover:text-surface-400 cursor-pointer"
					onclick={() => statusMsg = 'j/k:nav  y:copy  r:refresh  1/2/3:view  /:search  ::cmd'}>?</span>
			{/if}
		{/if}
	</div>
</div>

<style>
	.mesh-card {
		background: color-mix(in oklab, var(--color-surface-800) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		border-radius: 6px;
		padding: 0.6rem 0.75rem;
		text-align: center;
	}
	.mesh-card-active {
		border-color: color-mix(in oklab, var(--color-success-600) 30%, transparent);
		background: color-mix(in oklab, var(--color-success-950) 30%, var(--color-surface-800) 70%);
	}
	.mesh-card-inactive {
		border-color: color-mix(in oklab, var(--color-danger-600) 30%, transparent);
	}
	.mesh-card-label {
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-surface-500);
		margin-bottom: 0.15rem;
	}
	.mesh-card-value {
		font-size: 22px;
		font-weight: 700;
		font-family: var(--font-mono, monospace);
		color: var(--color-surface-200);
		line-height: 1.1;
	}
	.mesh-card-sub {
		font-size: 9px;
		font-family: var(--font-mono, monospace);
		color: var(--color-surface-500);
		margin-top: 0.15rem;
	}
</style>
